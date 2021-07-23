# bank

Import various transaction formats into a nice structured postgres database.

> 🚨🚨 Do not use this, I am just fooling around here.  🚨🚨

## Quick Start

1. You need an env file with the following:

    - `GH_TOKEN=...` Allows downloading zip archive of repo
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

## FAQ

### What is day_order in the schema?

Some csv's files do not provide a lot of context, often just a date with no timestamp, an amount and a description.  The problem is you can have 2 different transactions that look like duplicates because they have the same description, amount and date.

`day_order` simply records, for a given day, when this was imported, what was this tranactions order in the file.  It's arbitrary, we don't actually know the transactions are well ordered in the csv file when we get it, but it means later on if we re-import another file that overlaps with data we've imported before, we will skip/update rows we've seen and only import the rows we haven't seen before.

A key goal of this importer is to be idempotent and never create duplicate data.  Each row has a unique constraint on `(bank_id, account_no, created_on, day_order, subtotal_aud, description)` and `(created_on, day_order)` so two rows with the same date and day order can never be repeated.

`day_order` isn't full proof though, it is just a safe guard, you can break it.  For example, if you went to the same ATM 6 times in the same day.  Each time you create a new row in your CSV export matching this transaction, all with the same date, amount, and description.

If every time you went to the ATM, you took an export of the entire day so far and re-imported it, day order would work fine.  But if you only added the new row instead all rows to date, `day_order` would always = 1 and would be interpreted as an existing row and be ignored.

So it is crucial, (counter intuitively) - when importing, import the entire day, not just the end of day with the new records you haven't yet imported.  That entire day gives the importer sufficient context to know when we've seen a row before or not accurately.  Otherwise `day_order` could be incorrect.  Maybe if there is a need, in the future we could add an a single day append mode which sets the initial `day_order` to the count of rows for that day, for that account, thus forcing an append with no duplicate detection.