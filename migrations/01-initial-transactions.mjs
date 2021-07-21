export const name = 'Initial Transactions'
export const description = `
    Initial tables to store transaction data
`

export async function transaction(sql){
    await sql`
        create table transaction(
            transaction_id uuid primary key default public.gen_random_uuid()
            , hash text not null
            , account_no text not null
            , transaction_type text null
            , payee text null
            , description text not null
            , category text null
            , created_at timestamptz not null
            , tags text not null
            , subtotal_aud bigint not null
            , currency text not null
            , fee_aud bigint not null
            , round_up bigint not null
            , total_aud bigint not null
            , payment_method text null
            , settled_date date not null

            , UNIQUE (hash)
        );
    `
}