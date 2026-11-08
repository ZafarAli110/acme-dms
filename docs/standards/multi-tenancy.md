# Dealers and their locations

Acme DMS is one deployment that serves **many dealers**. A dealer is a client of ours: a dealer group, such as
Northwind Motors or City Motors, with its **locations** (rooftops: Northwind has Northside, Riverside and Westgate;
City Motors has Central). Every dealer's data lives in the **same databases**, side by side, so every business row
says whose it is.

Two levels of separation, both enforced by the database (dealership-api) or by an EF Core filter (the .NET services):

- **Dealer:** one dealer never sees, changes or even learns of another dealer's data. Every business table has a
  `dealer_id` column, and the table's policy limits a request to `userContext.dealerId`.
- **Location:** within a dealer, location-scoped data belongs to one rooftop and a request sees only the selected
  location's.

Getting either wrong leaks data: a missed location shows one rooftop another's customers; a missed dealer shows them
**another company's** customers. That is why the scope is declared once, on the table, and not repeated in every query.
Read this before adding any table or query.

identity-api and document-api keep a dealer column too, with an EF Core global filter that adds it automatically.
dealership-api does the same with Postgres row-level security, below.

## The dealer: on every row, from the token

- The dealer comes from the access token's `dealer_id` claim (`userContext.dealerId`). **Never take a dealer id from a
  request body, query string or header.**
- Every business table has `dealer_id uuid NOT NULL`. Every insert sets it from `userContext.dealerId`; a message
  handler (no signed-in user) takes it from the message, which carries the dealer of the record it is about.
- A query of dealership data, including updates and deletes, does **not** name the dealer: the table's policy does. An id
  from the URL is still not proof the row is the caller's, and it does not have to be: the policy hides another dealer's
  row, so `PUT /v1/stock/{partId}` with another dealer's part id finds nothing and is "not found". Keep the lookup of
  every id (the part, the bin) in the handler: a foreign key ignores row-level security, so the lookup, which the policy
  filters, is what refuses another dealer's id.

## The database enforces it too: row-level security (dealership-api)

Postgres keeps every request to its dealer, its location and, for exports, its user, and a write for another dealer or
location is refused (the `row_level_security` migration). This is the rule, not a backstop: handlers do not repeat it in their `where`.

- A request's unit of work works as the `dealership_api_user` role with `app.dealer_id`, `app.location_id` and
  `app.user_id` set from the token (`#request-scope/data-scope`, filled in by the authorization guard). Code outside a
  request (the export worker, the message consumer, migrations, the seed) works as the tables' owner, unfiltered,
  and **filters by hand**: the customer export names the dealer and the location itself. A request whose scope was
  never set (a route that is public, a guard that did not run) works as the same role with no scope and sees nothing.
  The one exception is the signed export download: no token, so it asks for `beginAsync({ asOwner: true })`. (`softDeleteAsync`
  also runs one statement outside the role, naming the dealer and location itself: `database.md`, "Soft delete".)
- **A search, or a text filter, on a big list** (the customer list's search box, and its filters on name, company,
  email, phone or city) is the other exception. Under a policy, Postgres must check the policy before any condition
  that is not _leakproof_, and `ILIKE` is not (nor are trigram `%` or full-text `@@`), so no index could serve them.
  So only the page's ids and the count are found as the owner, with the dealer, the location and `notDeleted(…)`
  written out (`GetCustomerListQueryHandler.findScopedAsync`, chosen by `matchesText`, and the list's count,
  `CountCustomersQueryHandler`, by the same rule and `ownerScoped`); the rows are then read as the request, so the
  policy still decides what comes back. The count is not re-read, so its hand-written scope has its
  own test (another location's and deleted rows never counted). Anything else stays under the policy: a status or
  date filter uses `=`, `<` or `>`, which are leakproof.
- The policies, by kind of table: location-scoped (`customers`, `customer_names`, `bins`, `part_inventories`): dealer
  and location (the name list is read under its policy: a location has hundreds to a few thousand names, so the policy
  narrows them before the trigram `%` runs);
  `export_jobs`: dealer, location and its owner; dealer-scoped (`parts`, `part_photos`): dealer; no dealer at all
  (`processed_messages`): none. With no location selected, location-scoped tables return nothing.
- **Write only what is the handler's own business**: the id, the search, the rules. Deleted rows are left out by a
  restrictive policy per table too (`database.md`, "Soft delete"), so no `notDeleted(…)`; outside a request it is
  written by hand. The policy's conditions join the same `WHERE`, so the indexes are used as before. Inserts still
  set `dealerId` and `locationId` from `userContext`; the policy refuses any other value.
- **A new business table gets its policy** in the migration that creates it, by the same kinds, and a test
  (`row-level-security.test.ts`) fails until it has one, unless it is on the short list there with its reason.
- **How a table is shared is its policy**: a feature that shares a location, or a dealer, differently gets a different
  policy on its table (`parts` is dealer-wide, `customers` one location's); a handler never works around one. A
  feature that must read across locations asks for it explicitly in the unit of work and a reviewed policy, not by
  leaving a filter out.
- Something a request must count or see across dealers (an export's place in line) is a `SECURITY DEFINER` function
  that returns only what is needed, never a reason to switch the role off.
- identity-api (EF Core) does the same with a named query filter, `IdentityDbContext.DealerFilter`: a signed-in
  user's queries see only their dealer's users, locations, role assignments and dealer. With no one signed in (sign-in
  itself, the seeder, key rotation) it filters nothing; `IgnoreQueryFilters([IdentityDbContext.DealerFilter])` is a
  finding outside those.

## Location: explicit, and only for location-scoped data

Some data belongs to the whole dealer and some to one location. A location-scoped table has a `location_id` column and a
policy on `dealer_id` and `location_id`; a request sees only its selected location's rows (`userContext.locationId`).

| Shared by all of the dealer's locations  | Belongs to one location                              |
| ---------------------------------------- | ---------------------------------------------------- |
| part master (number, description, price) | part inventory: bin, quantity on hand, reorder level |
| part photos                              | bins                                                 |
| vendors                                  | customers (each location keeps its own book)         |
| users (with a role per location)         | customers' cars (with their customer), appointments  |
|                                          | documents attached to location-scoped records        |

### Unique within the dealer, owned by one location

Something that is unique in the real world (a part number, a car's VIN) is unique within the **dealer**, all its
locations, even when the record that holds it belongs to one location. Another dealer may have the same value: City
Motors stocks `BRK-PAD-001` too. Check it with a query across the dealer's locations and a unique index on
`(dealer_id, value)` (not on `location_id`, and not on the value alone), and answer a duplicate with `409`. When the
duplicate is at another of the dealer's locations, say which location, but never return that location's records: a
refusal must not leak another location's customer.

### Parts live in a location's inventory

A part number is unique across the client, but **a location only has the parts it stocks**. Every stocked part has a
part inventory at that location, kept in one of that location's bins.

- **Creating a part needs a bin** of the selected location (`binId`, picked from `GET /v1/bins`), plus the quantity on
  hand and reorder level. The part and its inventory are created together; there is no part without inventory.
- **Lists and lookups of parts go through the inventory** of the selected location. A part the location does not stock
  is "not found" there, even though it exists at another location.
- **Stocking an existing part at another location** is `PUT /v1/stock/{partId}` at that location, with one of its bins.
- A bin from another location is refused (400). Bins are per location even when their codes look alike.

Rules:

1. The dealer comes from the token, `userContext.dealerId`, and the policy filters by it. The location comes from `x-location-id`, validated against the user's token. **Never take a location id from a
   request body or query string** — it would let a user act on a location they do not work at.
2. A handler of location-scoped data calls `requireLocation(userContext)` first (see the bins, customers and stock
   handlers): without a location the policy would return nothing, and the caller must hear 400, not an empty list.
3. Never cache dealership data under a key that does not include the dealer, and location-scoped data under a key that
   does not include the location.
4. A list endpoint for location-scoped data returns 400 when no location is selected.
