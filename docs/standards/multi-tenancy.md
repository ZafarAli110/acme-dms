# Dealers and their locations

Acme DMS is one deployment that serves **many dealers**. A dealer is a client of ours: a dealer group, such as
Northwind Motors or City Motors, with its **locations** (rooftops: Northwind has Northside, Riverside and Westgate;
City Motors has Central). Every dealer's data lives in the **same databases**, side by side, so every business row
says whose it is.

Two levels of separation, both enforced by hand in every query:

- **Dealer:** one dealer never sees, changes or even learns of another dealer's data. Every business table has a
  `dealer_id` column, and every query filters by `userContext.dealerId`.
- **Location:** within a dealer, location-scoped data belongs to one rooftop and is filtered by the selected location.

Getting either wrong leaks data: a missed location filter shows one rooftop another's customers; a missed dealer
filter shows them **another company's** customers. Read this before adding any table or query.

identity-api and document-api keep a dealer column too, with an EF Core global filter that adds it automatically.
dealership-api has no automatic filter: the dealer and the location are both explicit.

## The dealer: on every row, from the token

- The dealer comes from the access token's `dealer_id` claim (`userContext.dealerId`). **Never take a dealer id from a
  request body, query string or header.**
- Every business table has `dealer_id uuid NOT NULL`. Every insert sets it from `userContext.dealerId`; a message
  handler (no signed-in user) takes it from the message, which carries the dealer of the record it is about.
- Every query of dealership data, including updates and deletes, has `eq(table.dealerId, userContext.dealerId)` in its
  own `where`, even when it also filters by location or looks a row up by its id. An id from the URL is not proof the
  row is the caller's: `PUT /v1/stock/{partId}` with another dealer's part id must be "not found".

## Location: explicit, and only for location-scoped data

Some data belongs to the whole dealer and some to one location. **There is no automatic filter for locations.** Every
query of location-scoped data must filter by the user's selected location (`userContext.locationId`), and every
location-scoped table must have a `location_id` column.

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

1. The dealer comes from the token, `userContext.dealerId`, and every query filters by it. The location comes from `x-location-id`, validated against the user's token. **Never take a location id from a
   request body or query string** — it would let a user act on a location they do not work at.
2. Every query of location-scoped data also filters by the user's location, `requireLocation(userContext)`, in its own
   `where` (see the bins, customers and stock handlers).
3. Never cache dealership data under a key that does not include the dealer, and location-scoped data under a key that
   does not include the location.
4. A list endpoint for location-scoped data returns 400 when no location is selected.
