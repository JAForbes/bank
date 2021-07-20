# bank

Bank stuff

## Quick Start

1. You need an env file with the following:

    - `GH_TOKEN=...` Allows downloading zip archive of repo
    - `DATA_REPO=USERNAME/REPONAME` Allows downloading zip archive of repo
        - If there is no DATA_URL we assume the data is already downloaded
    - `CLUSTER_URL=postgres://postgres@127.0.0.1` A postgres connection string for running migration and create database statements.
    - `PGDATABASE` The name of your existing target database, or the database you want to be created

2. Clone this repo, npm install
3. `./run.mjs fetchBankData` to grab the data
4. `./run.mjs migrations` to perform db setup
5. `./run.mjs importers` to run the importers

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

Anyone who uses Teachers Mutual Bank or Up.  I'm likely to add CBA near term because I have CBA accounts.  It is fairly simple to add other importers and I'm open to it if anyone wants to make a PR.

## What's on the roadmap?

Honestly who knows.  This is a first step.  But I'd like to have a basic dash that shows me how much I'm spending in various categories and to be able to easily query my financials remotely.  But I may just keep this as an import repo, and then from there, there's open source Airtable alternatives that can connect straight to postgres, so that may be the endgame.

## Directory Structure

The structure at the moment is as follows.

```
# tree data/input 
data/input/
└── Bank
    ├── TMB
    │   └── <ACCOUNT NO>
    │       └── <ACCOUNT_NAME>
    │           ├── FYXXXX.CSV
    └── Up
        ├── 2Up
        │   ├── YYYY-MM.csv
        ├── <upname>
        │   ├── YYYY-MM.csv
        └── <upname>
            ├── YYYY-MM.csv
```

When a new banking provider is supported, the structure will be fairly similar.  E.g. if CBA was added it might look like this:


```
# tree data/input 
data/input/
└── Bank
    ├── CBA
    │   └── <BSB + Account No>
    │       └── <Account Type (e.g. Credit Card)>
    │           ├── YYYY-MM.CSV
    
```

## FAQ

### Why does TMB use the FYYYY.csv naming convention?

I don't use TMB very often, so I name it that way because I am grabbing entire years just to have historical data.  But it is just the standard TMB format.  And the name of the file isn't actually import, we just can for CSV files. 
