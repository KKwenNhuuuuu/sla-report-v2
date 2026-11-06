import { DateTime } from "luxon";
import { generateSLAReport } from "./slaService.js";

const sorts = new Set(["id", "-id", "response_business_minutes", "-response_business_minutes"]);

function invalidRequest(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function readOptionalId(value, name) {
    if (value === undefined || value === "") return null;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        throw invalidRequest(`Invalid ${name}.`);
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id)) throw invalidRequest(`Invalid ${name}.`);
    return id;
}

function readBoolean(value, name) {
    if (value === undefined || value === "") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    throw invalidRequest(`Invalid ${name}; expected true or false.`);
}

function normalizeQuery(query) {
    const { from, to } = query;
    const fromDate = typeof from === "string" ? DateTime.fromISO(from, { setZone: true }) : null;
    const toDate = typeof to === "string" ? DateTime.fromISO(to, { setZone: true }) : null;
    if (!fromDate?.isValid || fromDate.toISODate() !== from ||
        !toDate?.isValid || toDate.toISODate() !== to) {
        throw invalidRequest("Valid 'from' and 'to' dates in YYYY-MM-DD format are required.");
    }
    if (from > to) throw invalidRequest("'from' date cannot be after 'to' date.");

    const siteId = readOptionalId(query.site_id, "site_id");
    const responderId = readOptionalId(query.responder_id, "responder_id");
    const late = readBoolean(query.late, "late");
    const withinTarget = readBoolean(query.within_target, "within_target");
    const sort = query.sort === undefined ? "id" : query.sort;
    if (typeof sort !== "string" || !sorts.has(sort)) {
        throw invalidRequest("Invalid sort option.");
    }

    const rawLimit = query.limit === undefined || query.limit === "" ? "50" : query.limit;
    if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
        throw invalidRequest("Invalid limit; expected a number from 1 to 200.");
    }
    const limit = Number(rawLimit);
    if (limit < 1 || limit > 200) {
        throw invalidRequest("Invalid limit; expected a number from 1 to 200.");
    }

    return {
        from,
        to,
        siteId,
        responderId,
        late,
        withinTarget,
        sort,
        limit
    };
}

function compareRequests(a, b, sort) {
    if (sort === "id") return a.id - b.id;
    if (sort === "-id") return b.id - a.id;

    const direction = sort.startsWith("-") ? -1 : 1;
    const aValue = a.response_business_minutes;
    const bValue = b.response_business_minutes;
    if (aValue === null && bValue !== null) return 1;
    if (bValue === null && aValue !== null) return -1;
    if (aValue !== bValue) return (aValue - bValue) * direction;
    return a.id - b.id;
}

export async function getRequestsList(queryParams, db) {
    const query = normalizeQuery(queryParams);
    const report = await generateSLAReport(query.from, query.to, db);

    const filtered = report.requests.filter((request) =>
        (query.siteId === null || request.site_id === query.siteId) &&
        (query.responderId === null || request.responder_id === query.responderId) &&
        (query.late === null || request.completed_late === query.late) &&
        (query.withinTarget === null || request.within_target === query.withinTarget)
    );
    filtered.sort((a, b) => compareRequests(a, b, query.sort));

    const page = filtered.slice(0, query.limit);

    return {
        data: page
    };
}