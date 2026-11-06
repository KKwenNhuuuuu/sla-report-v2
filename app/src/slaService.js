import { DateTime } from "luxon";

function parseBusinessHours(value) {
    return typeof value === "string" ? JSON.parse(value) : value;
}

function parseHolidayDate(value) {
    const parsed = DateTime.fromFormat(value, "dd/MM/yyyy", { zone: "utc" });
    return (parsed.isValid ? parsed : DateTime.fromISO(value, { zone: "utc" })).toISODate();
}

function parseLocalDateTime(value, timezone) {
    const formats = ["dd/MM/yyyy HH:mm", "d/M/yyyy H:mm", "yyyy-MM-dd HH:mm"];
    for (const format of formats) {
        const parsed = DateTime.fromFormat(value, format, { zone: timezone });
        if (parsed.isValid) return parsed;
    }
    return DateTime.invalid(`Invalid local date-time: ${value}`);
}

function parseReportDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
    const parsed = DateTime.fromISO(value, { zone: "utc" });
    return parsed.isValid && parsed.toISODate() === value ? parsed : null;
}

export function convertToSiteTimezone(value, timezone) {
    const timestamp = DateTime.fromISO(value, { setZone: true });
    if (!timestamp.isValid) {
        throw new Error(`Invalid request creation timestamp: ${value}`);
    }

    const localDate = timestamp.setZone(timezone);
    if (!localDate.isValid) {
        throw new Error(`Invalid site timezone: ${timezone}`);
    }
    return localDate.toISODate();
}

export function calculateBusinessMinutes(startValue, endSeconds, site) {
    const start = DateTime.fromISO(startValue, { setZone: true }).setZone(site.timezone);
    const end = DateTime.fromSeconds(endSeconds, { zone: site.timezone });
    if (!start.isValid || !end.isValid) {
        throw new Error("Invalid timestamp or site timezone while calculating business minutes");
    }
    if (end <= start) return 0;

    let totalSeconds = 0;
    let day = start.startOf("day");
    const lastDay = end.startOf("day");

    while (day <= lastDay) {
        const date = day.toISODate();
        const weekday = day.toFormat("ccc").toLowerCase();
        const hours = site.businessHours?.[weekday];

        if (hours && !site.holidays.has(date)) {
            const opens = DateTime.fromFormat(
                `${date} ${hours.open}`,
                "yyyy-MM-dd HH:mm",
                { zone: site.timezone }
            );
            const closes = DateTime.fromFormat(
                `${date} ${hours.close}`,
                "yyyy-MM-dd HH:mm",
                { zone: site.timezone }
            );
            if (!opens.isValid || !closes.isValid) {
                throw new Error(`Invalid business hours for ${weekday} at ${site.timezone}`);
            }

            const overlapStart = Math.max(start.toMillis(), opens.toMillis());
            const overlapEnd = Math.min(end.toMillis(), closes.toMillis());
            if (overlapEnd > overlapStart) {
                totalSeconds += (overlapEnd - overlapStart) / 1000;
            }
        }

        day = day.plus({ days: 1 });
    }

    return Math.floor(totalSeconds / 60);
}

export async function generateSLAReport(fromDateStr, toDateStr, db) {
    const fromDate = parseReportDate(fromDateStr);
    const toDate = parseReportDate(toDateStr);
    if (!fromDate || !toDate || fromDate > toDate) {
        throw new Error("Invalid SLA report date range");
    }

    const staffRows = await db.all("SELECT id, name FROM staff");
    const staffMap = new Map(staffRows.map((row) => [row.id, row.name]));
    const siteRows = await db.all("SELECT id, timezone, business_hours FROM sites");
    const siteMap = new Map();

    for (const row of siteRows) {
        const holidayRows = await db.all(
            "SELECT date FROM holidays WHERE site_id = ?",
            [row.id]
        );
        siteMap.set(row.id, {
            timezone: row.timezone,
            businessHours: parseBusinessHours(row.business_hours),
            holidays: new Set(holidayRows.map((holiday) => parseHolidayDate(holiday.date)))
        });
    }

    const requestRows = await db.all(`
        SELECT id, site_id, priority, status, created_at, deleted_at, merged_into_id
        FROM requests
        WHERE status != 'canceled'
          AND deleted_at IS NULL
          AND merged_into_id IS NULL
    `);
    const events = await db.all(`
        SELECT id, request_id, status, at, actor_id, due_at, reverts_id
        FROM events
        ORDER BY at ASC
    `);
    const eventsByRequest = new Map();
    for (const event of events) {
        const requestEvents = eventsByRequest.get(event.request_id) ?? [];
        requestEvents.push(event);
        eventsByRequest.set(event.request_id, requestEvents);
    }

    const requests = [];
    const responderStats = new Map();

    for (const request of requestRows) {
        const site = siteMap.get(request.site_id);
        if (!site) {
            throw new Error(`Missing site ${request.site_id} for request ${request.id}`);
        }

        const localCreatedAtDate = convertToSiteTimezone(request.created_at, site.timezone);
        if (localCreatedAtDate < fromDateStr || localCreatedAtDate > toDateStr) continue;

        const requestEvents = eventsByRequest.get(request.id) ?? [];
        const revertedIds = new Set();
        for (const event of requestEvents) {
            if (event.reverts_id !== null && event.reverts_id !== undefined) {
                revertedIds.add(event.reverts_id);
                revertedIds.add(event.id);
            }
        }
        const validEvents = requestEvents.filter((event) => !revertedIds.has(event.id));

        const firstResponse = validEvents.find(
            (event) => event.status === "processing" && event.actor_id !== null
        );
        const responderId = firstResponse?.actor_id ?? null;
        const responseBusinessMinutes = firstResponse
            ? calculateBusinessMinutes(request.created_at, firstResponse.at, site)
            : null;
        const targetMinutes = request.priority === "High"
            ? 60
            : request.priority === "Medium"
                ? 240
                : 480;
        const withinTarget = responseBusinessMinutes === null
            ? null
            : responseBusinessMinutes <= targetMinutes;

        let latestDueAt = null;
        let lastCompleteAt = null;
        for (const event of validEvents) {
            if (event.due_at !== null) latestDueAt = event.due_at;
            if (event.status === "complete") lastCompleteAt = event.at;
        }

        let completedLate = null;
        if (lastCompleteAt !== null && latestDueAt !== null) {
            const deadline = parseLocalDateTime(latestDueAt, site.timezone);
            if (!deadline.isValid) {
                throw new Error(`Invalid deadline for request ${request.id}: ${latestDueAt}`);
            }
            completedLate = lastCompleteAt > deadline.toSeconds();
        }

        const responderName = responderId === null ? null : staffMap.get(responderId) ?? null;
        requests.push({
            id: request.id,
            site_id: request.site_id,
            responder_id: responderId,
            responder: responderName,
            response_business_minutes: responseBusinessMinutes,
            within_target: withinTarget,
            completed_late: completedLate
        });

        if (responderId !== null) {
            let stats = responderStats.get(responderId);
            if (!stats) {
                stats = {
                    id: responderId,
                    name: responderName,
                    requests: 0,
                    within_target: 0,
                    completed_late: 0
                };
                responderStats.set(responderId, stats);
            }
            stats.requests += 1;
            if (withinTarget === true) stats.within_target += 1;
            if (completedLate === true) stats.completed_late += 1;
        }
    }

    return {
        from: fromDateStr,
        to: toDateStr,
        requests,
        responders: [...responderStats.values()]
    };
}
