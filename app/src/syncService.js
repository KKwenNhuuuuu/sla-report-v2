import { client } from './helpdesk.js';

export let isAppReady = false;

export async function runInitialSync(db) {
    const state = await db.get('SELECT value FROM sync_state WHERE key = "next_cursor"');
    
    if (state && state.value) {
        console.log("Found existing cursor. Skipping initial sync. Starting live sync...");
        isAppReady = true; 
        return;
    }

    console.log("Data Sync (Sites, Holidays, Staff)...");
    console.time("Initial Sync Time");

    const sitesRes = await client.get('/v1/sites');
    for (let site of sitesRes.data) {
        await db.run('INSERT OR REPLACE INTO sites (id, timezone, business_hours) VALUES (?, ?, ?)',
            [site.id, site.timezone, JSON.stringify(site.business_hours)]);

        const holidaysRes = await client.get(`/v1/sites/${site.id}/holidays`);
        for (let hol of holidaysRes.data) {
            await db.run('INSERT OR REPLACE INTO holidays (site_id, date, name) VALUES (?, ?, ?)',
                [site.id, hol.date, hol.name]);
        }
    }

    const staffRes = await client.get('/v1/staff');
    for (let s of staffRes.data) {
        await db.run('INSERT OR REPLACE INTO staff (id, name) VALUES (?, ?)', [s.id, s.name]);
    }

    console.log("Sync Requests & Events...");

    let cursor = null;
    let hasMore = true;
    let batchCount = 0;

    while (hasMore) {
        let url = '/v1/changes?limit=500';
        if (cursor) url += `&cursor=${cursor}`;

        const changesRes = await client.get(url);

        await db.exec('BEGIN TRANSACTION');

        for (let change of changesRes.data) {
            if (change.type === 'request.created' || change.type === 'request.updated') {
                const r = change.request;
                await db.run(`INSERT OR REPLACE INTO requests 
                    (id, site_id, priority, status, created_at, deleted_at, merged_into_id, raw_data) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [r.id, r.site_id, r.priority, r.status, r.created_at, r.deleted_at, r.merged_into_id, JSON.stringify(r)]);
            }
            else if (change.type === 'event.created') {
                const e = change.event;
                await db.run(`INSERT OR REPLACE INTO events 
                    (id, request_id, status, at, actor_id, due_at, reverts_id, raw_data) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [e.id, change.request_id, e.status, e.at, e.actor_id, e.due_at, e.reverts_id, JSON.stringify(e)]);
            }
            else if (change.type === 'staff.updated') {
                const s = change.staff;
                await db.run('INSERT OR REPLACE INTO staff (id, name) VALUES (?, ?)', [s.id, s.name]);
            }
        }

        await db.exec('COMMIT');

        cursor = changesRes.next_cursor;
        hasMore = changesRes.has_more;
        batchCount++;
        console.log(`Done ${batchCount}. Remaing Data? ${hasMore}`);
    }

    if (cursor) {
        await db.run('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)', ['next_cursor', cursor]);
    }

    isAppReady = true;
    console.timeEnd("Initial Sync Time");
    console.log("Initial Sync Complete. App is ready.");
}