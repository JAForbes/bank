#!./node_modules/.bin/pgzx

sql.onnotice = x => {
    if(x.severity == 'NOTICE') return;
    console.log(x)
}

{
    let sql = global.sql.unsafe;

    await sql`
        create extension if not exists pgcrypto;
        create schema if not exists ops;
        create table if not exists ops.migration (
            migration_id uuid primary key default public.gen_random_uuid(),
            name text not null,
            filename text not null,
            description text
        );
    `
}

const migrations = [
    './initial-transactions.mjs'
]

{
    for ( let migration of migrations ) {
        let module = await import(migration)
        if ( !module.name ) {
            console.error('Migration', migration, 'did not export a name.')
            process.exit(1)
        } else if (!(module.transaction || module.action)) {
            console.error('Migration', migration, 'did not export a transaction or action function.')
            process.exit(1)
        }
        let action = module.action || (sql => sql.begin(module.transaction))

        const [found] = await sql`
            select * from ops.migration where name = ${module.name}
        `
        let description = module.description.split('\n').map( x => x.trim() ).filter(Boolean).join('\n')
        if (!found){
            try {
                await action(sql)
                await sql`
                    insert into ops.migration(name, filename, description) 
                    values (${module.name}, ${migration}, ${description})
                `
            } catch (e) {
                console.error(e)
                process.exit(1)
            }
        } else {
            console.log('Found', found)
        }
    }
}

