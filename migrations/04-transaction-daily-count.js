export const name = 'Transaction Daily Count' + Math.random()
export const description = `
    Sometimes csv's from bank's do not provide enough information for us
    to guarantee two different rows aren't the same transaction.

    E.g. CBA and TMB only give date, description and amount. 

    If two transactions occur on the same day, with the same description with the same amount and we import them
    at different time intervals (say hourly), how is the importer to know this isn't the same row it saw before.

    The idea of this migration is to store the count of transactions for that day so if we have 2 similar transactions
    we can tell they aren't duplicated because one was the 5th transaction that day, and another was the 11th.
`

// todo-james add to pgmg
function triggerChange(sql, { table, column, expression, security='invoker' }){
    let TG_NAME = `${table}_${column}`
    let FN_NAME = `${table}_${column}`
    sql = String.raw

    const out = sql`
        create or replace function ${FN_NAME}() returns trigger as $$
        begin
            ${expression};
            return NEW
        end;
        $$ language plpgsql security ${security} set search_path = ''

        create trigger ${TG_NAME}_update
        before update on ${table}
        for each row
        execute function ${FN_NAME}();

        create trigger ${TG_NAME}_insert
        before insert on ${table}
        for each row
        execute function ${FN_NAME}();
    `

    return out
}

export async function transaction(sql){

    console.log(
        triggerChange(sql, { 
            table: 'transaction', 
            column: 'created_at', 
            expression: 'NEW.created_on = date(NEW.created_at)' 
        })
    )

    throw new Error('Rollback')
}

export async function transaction(SQL){
    // todo-james add to pgmg
    function raw(strings, ...values){
        return SQL.unsafe(strings.map( (x,i) => x + values[i] ))
    }

    let sql = raw

    await sql`
        alter table transaction 
            add column day_order int null
            ,
            add column created_on date null
        ;

        update transaction set created_on = date(created_at);

        ${
            triggerChange({ 
                table: 'transaction', 
                column: 'created_at', 
                expression: 'NEW.created_on = date(NEW.created_at)' 
            })
        })

        with xs as (
            select 
                row_number () over (partition by created_on order by created_at) as day_order
                , transaction_id
            from transaction
        ) 
        update transaction set day_order = xs.day_order
        from xs
        where transaction.transaction_id = xs.transaction_id;

        alter table transaction 
            alter column day_order set not null
            ,
            alter column created_on set not null
        ;
        
        alter table transaction 
            add constraint ordered_day_transactions unique ( created_on, day_order )
        ;
    `
}