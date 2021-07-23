export const name = 'Transaction Daily Count'
export const description = `
    Sometimes csv's from bank's do not provide enough information for us
    to guarantee two different rows aren't the same transaction.

    E.g. CBA and TMB only give date, description and amount. 

    If two transactions occur on the same day, with the same description with the same amount and we import them
    at different time intervals (say hourly), how is the importer to know this isn't the same row it saw before.

    The idea of this migration is to store the count of transactions for that day so if we have 2 similar transactions
    we can tell they aren't duplicated because one was the 5th transaction that day, and another was the 11th.
`

export async function transaction({ raw: sql }){

    await sql`
        alter table transaction 
            add column day_order int null
            ,
            add column created_on date null
        ;

        update transaction set created_on = date(created_at);

        ${
            sql.pgmg.triggerChange(sql, { 
                table: 'transaction' 
                ,column: 'created_at' 
                ,expression: 'NEW.created_on = date(NEW.created_at)' 
            })
        }

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