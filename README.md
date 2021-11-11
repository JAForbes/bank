# bank

Import various transaction formats into a nice structured postgres database.

> 🚨🚨 Do not use this, I am just fooling around here.  🚨🚨

## Quick Start

1. You need an env file with the following:

    - `DATA_REPO=USERNAME/REPONAME` Allows downloading zip archive of repo
        - If there is no DATA_URL we assume the data is already downloaded
    - `CLUSTER_URL=postgres://postgres@127.0.0.1` A postgres connection string for running migration and create database statements.
    - `PGDATABASE` The name of your existing target database, or the database you want to be created
    - `TZ="+10:00"` The timezone offset for csv formats that only have datestamps

2. Clone this repo, npm install
3. `npx zxrun fetchBankData` to grab the data
4. `npx zxrun migrations` to perform db setup
5. `npx zxrun importers` to run the importers

You should now have a db filled with transaction data.

```bash
# Should log out the number of transactions.
psql "$CLUSTER_URL/$PGDATABASE" -c "select count(*) from transaction"
```

## What

Some scripts to load various bank csv's into a shared postgres schema.

## Why

Having all this stuff centralized in a database makes it easy to answer a lot of common questions that are important for budgeting, doing your taxes, or applying for loans.

It is good to be able to easily introspect your finances.

## Who can use this?

First of all, don't use this.  It's highly experimental and likely won't work for you yet.

But ... hypothetically - anyone who uses Teachers Mutual Bank, Up or CBA.

Right now the importers are deliberately messy and duplicated because I'm trying to see the exact right abstraction boundary.  But soon it will stabilize and I'll accept PRs for other formats.

## What's on the roadmap?

Honestly who knows.  Right now I am just focused on importing data.  Initially this was just for me, but now I'm considering multi tenancy, so that's probably next.

## Directory Structure

The structure at the moment is as follows.

```
# tree data/input 
data/input/
└── Bank
    ├── TMB
    │   └── <ACCOUNT NO>
    │       └── <ACCOUNT_NAME>
    │           ├── *.CSV
    └── Up
    |   ├── <upname>
    |   │   ├── *.csv
    |   ├── <upname>
    |   │   ├── *.csv
    |   └── <upname>
    |       ├── *.csv
    └── CBA
        ├── <Account Holder>
            ├── <Account Name-BSB-ACCOUNT_NO>
                ├── *.csv

```

You can probably see I'm trying to encode missing data in the file structure.  Unfortunately the csv's don't offer much beyond transactions and dates.  So it's either file structure, or config file, or UI, or something else.  Right now its file structure, but that has its limits.

## Schema

## bank

A simple table that helps segregate data by bank.  Note this represents the organization, not a specific branch.

```
                      Table "public.bank"
   Column    | Type | Collation | Nullable |      Default      
-------------+------+-----------+----------+-------------------
 bank_id     | uuid |           | not null | gen_random_uuid()
 name        | text |           | not null | 
 description | text |           | not null | ''::text
Indexes:
    "bank_pkey" PRIMARY KEY, btree (bank_id)
    "bank_name_key" UNIQUE CONSTRAINT, btree (name)
Referenced by:
    TABLE "account" CONSTRAINT "account_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES bank(bank_id)
    TABLE "transaction" CONSTRAINT "transaction_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES bank(bank_id)

```

## account

Represents a bank account.  

Transaction joins onto this table via the account_no and bank_id as the account_no will usually be in the data, and there aren't so many banks that querying them at the start of an import would be expensive.

```
                                Table "public.account"
     Column     |           Type           | Collation | Nullable |      Default      
----------------+--------------------------+-----------+----------+-------------------
 account_id     | uuid                     |           | not null | gen_random_uuid()
 account_no     | text                     |           | not null | 
 account_name   | text                     |           |          | 
 account_holder | text                     |           |          | 
 created_at     | timestamp with time zone |           | not null | now()
 bank_id        | uuid                     |           | not null | 
Indexes:
    "account_pkey" PRIMARY KEY, btree (account_id)
    "unique_account" UNIQUE CONSTRAINT, btree (bank_id, account_no)
Foreign-key constraints:
    "account_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES bank(bank_id)
Referenced by:
    TABLE "transaction" CONSTRAINT "fk_account" FOREIGN KEY (bank_id, account_no) REFERENCES account(bank_id, account_no) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
```

## Transaction

Represents a financial transaction.  Modelled closely from the Up CSV export format (because it is excellent).

This format is largely a goal for other formats to aspire to, most csv's do not include categories, transaction_types, payee's etc.

The goal is to enrich those other formats by analyzing the amount+description per bank to propagate those other columns.

Eventually, hopefully making all columns not null.

```

                               Table "public.transaction"
      Column      |           Type           | Collation | Nullable |      Default      
------------------+--------------------------+-----------+----------+-------------------
 transaction_id   | uuid                     |           | not null | gen_random_uuid()
 account_no       | text                     |           | not null | 
 transaction_type | text                     |           |          | 
 payee            | text                     |           |          | 
 description      | text                     |           | not null | 
 category         | text                     |           |          | 
 created_at       | timestamp with time zone |           | not null | 
 tags             | text                     |           | not null | 
 subtotal_aud     | bigint                   |           | not null | 
 currency         | text                     |           | not null | 
 fee_aud          | bigint                   |           | not null | 
 round_up         | bigint                   |           | not null | 
 total_aud        | bigint                   |           | not null | 
 payment_method   | text                     |           |          | 
 settled_date     | date                     |           | not null | 
 day_order        | integer                  |           | not null | 
 created_on       | date                     |           | not null | 
 bank_id          | uuid                     |           | not null | 
Indexes:
    "transaction_pkey" PRIMARY KEY, btree (transaction_id)
    "unique_transaction" UNIQUE CONSTRAINT, btree (bank_id, account_no, created_on, day_order, subtotal_aud, description)
Foreign-key constraints:
    "fk_account" FOREIGN KEY (bank_id, account_no) REFERENCES account(bank_id, account_no) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    "transaction_bank_id_fkey" FOREIGN KEY (bank_id) REFERENCES bank(bank_id)
Triggers:
    transaction_created_at_insert BEFORE INSERT ON transaction FOR EACH ROW EXECUTE FUNCTION transaction_created_at()
    transaction_created_at_update BEFORE UPDATE ON transaction FOR EACH ROW EXECUTE FUNCTION transaction_created_at()

```

### Data Enrichment

For now, data enrichment is via plpgsql manual pattern matching hand crafted for each bank.  My expectation is after doing this for a few different banks particular techniques and patterns will emerge and while there will still be separate enrichment functions they will probably share some code.

Once there is a significant sample of enriched and unenriched data we may pivot to using machine learning to enrich data, but we'll use the manually enriched as both a baseline and a fallback until the machine learning approach accuracy is beyond question.

## FAQ

### Why is the data enrichment done in the database instead of on import?

I expect the enrichment will change all the time, it will need to be updated to account for new types of transactions we haven't seen before.
Or there have been rows we'd already imported we thought was free text but actually had a recognizable format once we've got a large enough sample.
Having the enrichment in the database allows us to re-enrich data that is already imported, and guarantee via triggers that all data in the database has passed through the enrichment layer even if data is manually entered via a UI, psql or an unofficial script.

Also having it in the database as plpgsql functions allows me to dogfood [pgmg](https://github.com/JAForbes/pgmg) plpgsql migration utilities in a fairly safe context that currently won't impact anyone in production.

### What is day_order in the schema?

Some csv's files do not provide a lot of context, often just a date with no timestamp, an amount and a description.  The problem is you can have 2 different transactions that look like duplicates because they have the same description, amount and date.

`day_order` simply records, for a given day, when this was imported, what was this tranactions order in the file.  It's arbitrary, we don't actually know the transactions are well ordered in the csv file when we get it, but it means later on if we re-import another file that overlaps with data we've imported before, we will skip/update rows we've seen and only import the rows we haven't seen before.

A key goal of this importer is to be idempotent and never create duplicate data.  Each row has a unique constraint on `(bank_id, account_no, created_on, day_order, subtotal_aud, description)` and `(created_on, day_order)` so two rows with the same date and day order can never be repeated.

`day_order` isn't full proof though, it is just a safe guard, you can break it.  For example, if you went to the same ATM 6 times in the same day.  Each time you create a new row in your CSV export matching this transaction, all with the same date, amount, and description.

If every time you went to the ATM, you took an export of the entire day so far and re-imported it, day order would work fine.  But if you only added the new row instead all rows to date, `day_order` would always = 1 and would be interpreted as an existing row and be ignored.

So it is crucial, (counter intuitively) - when importing, import the entire day, not just the end of day with the new records you haven't yet imported.  That entire day gives the importer sufficient context to know when we've seen a row before or not accurately.  Otherwise `day_order` could be incorrect.  Maybe if there is a need, in the future we could add an a single day append mode which sets the initial `day_order` to the count of rows for that day, for that account, thus forcing an append with no duplicate detection.