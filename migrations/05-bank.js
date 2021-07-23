export const name = 'Bank types'
export const description = `
    It is useful to be able to slice data based on the type of bank, e.g. to see all CBA transactions for a given user.

    Or to see how many Up accounts there are in the db vs 86400.

    It is also helpful for disambiguating transactions, its just another piece of information that may help isolate 
    that two rows are not the same transaction.

    This data is not usually in the csv itself, but is hard coded by the importer because it only imports one type of
    bank data.
`

export async function transaction({ raw: sql }){

    await sql`
        create table bank(
            bank_id uuid primary key default gen_random_uuid()
            , name text not null
            , description text not null default ''
            , unique (name)
        )
        ;

        insert into bank (name, description)
            values 
            ('CBA', 'Commonwealth Bank of Australia')
            , ('Up', 'Up Yeah!')
            , ('TMB', 'Teachers Mutual Bank')
        ;

        alter table transaction 
            add column bank_id uuid null references bank(bank_id)
        ;
        
        alter table account
            add column bank_id uuid null references bank(bank_id)
        ;

        -- ensure accounts exist for all bank/account_no combos on transaction
        insert into account(bank_id, account_no) 
        select distinct bank_id, account_no from transaction;

        alter table account
            alter column bank_id set not null;

        update transaction set bank_id = 
        case 
            when (transaction_type is null and category is null and payment_method is null)
            then (select bank_id from bank where name = 'TMB')
            else (select bank_id from bank where name = 'Up')
        end
        ;

        alter table transaction 
            alter column bank_id set not null
        ;

        alter table transaction
            drop constraint ordered_day_transactions
        ;

        alter table transaction 
            add constraint unique_transaction unique ( 
                bank_id
                , account_id
                , created_on
                , day_order 
                , subtotal_aud
                , description
            )
        ;
    
        alter table transaction 
        add constraint fk_account
            foreign key (bank_id, account_no) references account(bank_id, account_no) 
            on delete cascade deferrable initially deferred
        ;
    `
}