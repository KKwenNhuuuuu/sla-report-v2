import { test } from "node:test";
import assert from "node:assert/strict";
import { getRequestsList } from "../src/reqService.js";

const seconds = (value) => Math.floor(Date.parse(value) / 1000);

function createDatabase() {
    const requests = [1, 2, 3].map((id) => ({
        id,
        site_id: 11,
        priority: "High",
        status: id === 2 ? "pending" : "processing",
        created_at: "2026-10-05T00:00:00Z",
        deleted_at: null,
        merged_into_id: null
    }));
    const events = [
        {
            id: 11,
            request_id: 1,
            status: "processing",
            at: seconds("2026-10-05T00:42:00Z"),
            actor_id: 7,
            due_at: "05/10/2026 16:00",
            reverts_id: null
        },
        {
            id: 12,
            request_id: 1,
            status: "complete",
            at: seconds("2026-10-05T08:01:00Z"),
            actor_id: 7,
            due_at: null,
            reverts_id: null
        },
        {
            id: 31,
            request_id: 3,
            status: "processing",
            at: seconds("2026-10-05T00:10:00Z"),
            actor_id: 8,
            due_at: null,
            reverts_id: null
        }
    ];

    return {
        async all(sql) {
            if (sql.includes("FROM staff")) {
                return [{ id: 7, name: "Alex" }, { id: 8, name: "Sam" }];
            }
            if (sql.includes("FROM sites")) {
                return [{
                    id: 11,
                    timezone: "Asia/Singapore",
                    business_hours: JSON.stringify({
                        mon: { open: "08:00", close: "18:00" }
                    })
                }];
            }
            if (sql.includes("FROM holidays")) return [];
            if (sql.includes("FROM requests")) return requests;
            if (sql.includes("FROM events")) return events;
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
}

test("request list returns filtered and sorted SLA rows up to the requested limit", async () => {
    const db = createDatabase();
    const limitedList = await getRequestsList({
        from: "2026-10-05",
        to: "2026-10-05",
        limit: "2",
        sort: "-id"
    }, db);

    assert.deepEqual(limitedList.data.map((request) => request.id), [3, 2]);
    assert.equal("next_cursor" in limitedList, false);

    const lateOnly = await getRequestsList({
        from: "2026-10-05",
        to: "2026-10-05",
        late: "true"
    }, db);
    assert.deepEqual(lateOnly.data.map((request) => request.id), [1]);

    const responseTimeOrder = await getRequestsList({
        from: "2026-10-05",
        to: "2026-10-05",
        sort: "response_business_minutes"
    }, db);
    assert.deepEqual(responseTimeOrder.data.map((request) => request.id), [3, 1, 2]);

    const withinTarget = await getRequestsList({
        from: "2026-10-05",
        to: "2026-10-05",
        within_target: "true"
    }, db);
    assert.deepEqual(withinTarget.data.map((request) => request.id), [1, 3]);
});

test("request list rejects invalid filters", async () => {
    const db = createDatabase();
    await assert.rejects(
        getRequestsList({ from: "2026-10-05", to: "2026-10-05", sort: "created_at" }, db),
        { statusCode: 400 }
    );
});
