import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSLAReport } from "../src/slaService.js";

const seconds = (value) => Math.floor(Date.parse(value) / 1000);

function createDatabase() {
    const requestRows = [
        {
            id: 1,
            site_id: 11,
            priority: "High",
            status: "processing",
            created_at: "2026-10-04T16:30:00Z",
            deleted_at: null,
            merged_into_id: null
        },
        {
            id: 2,
            site_id: 11,
            priority: null,
            status: "pending",
            created_at: "2026-10-06T02:00:00Z",
            deleted_at: null,
            merged_into_id: null
        }
    ];
    const eventRows = [
        {
            id: 10,
            request_id: 1,
            status: "processing",
            at: seconds("2026-10-05T00:45:00Z"),
            actor_id: 99,
            due_at: null,
            reverts_id: null
        },
        {
            id: 11,
            request_id: 1,
            status: "pending",
            at: seconds("2026-10-05T00:50:00Z"),
            actor_id: 7,
            due_at: null,
            reverts_id: 10
        },
        {
            id: 13,
            request_id: 1,
            status: "processing",
            at: seconds("2026-10-05T01:30:00Z"),
            actor_id: 7,
            due_at: "05/10/2026 10:00",
            reverts_id: null
        },
        {
            id: 14,
            request_id: 1,
            status: "complete",
            at: seconds("2026-10-05T02:01:00Z"),
            actor_id: 7,
            due_at: null,
            reverts_id: null
        }
    ];

    return {
        async all(sql) {
            if (sql.includes("FROM staff")) return [{ id: 7, name: "Current Responder" }];
            if (sql.includes("FROM sites")) {
                return [{
                    id: 11,
                    timezone: "Asia/Singapore",
                    business_hours: JSON.stringify({
                        mon: { open: "08:00", close: "18:00" },
                        tue: { open: "08:00", close: "18:00" }
                    })
                }];
            }
            if (sql.includes("FROM holidays")) return [];
            if (sql.includes("FROM requests")) return requestRows;
            if (sql.includes("FROM events")) return eventRows;
            throw new Error(`Unexpected query: ${sql}`);
        }
    };
}

test("generates SLA rows using site-local dates, business hours, and reverted events", async () => {
    const report = await generateSLAReport("2026-10-05", "2026-10-06", createDatabase());

    assert.deepEqual(report.requests, [
        {
            id: 1,
            site_id: 11,
            responder_id: 7,
            responder: "Current Responder",
            response_business_minutes: 90,
            within_target: false,
            completed_late: true
        },
        {
            id: 2,
            site_id: 11,
            responder_id: null,
            responder: null,
            response_business_minutes: null,
            within_target: null,
            completed_late: null
        }
    ]);
    assert.deepEqual(report.responders, [{
        id: 7,
        name: "Current Responder",
        requests: 1,
        within_target: 0,
        completed_late: 1
    }]);
});
