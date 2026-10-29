# The client and its locations

Each Acme DMS deployment serves **one client**: a dealer (dealer group), here Northwind Motors, with its **locations**
(rooftops: Northside, Riverside and Westgate). Another dealer is another deployment with its own databases. So the dealership
database holds one client's data and has no dealer column, and nothing in dealership-api filters by dealer.

identity-api is shared and still knows the dealer (the token carries `dealer_id`); identity-api and document-api keep
their dealer column and EF Core global filter from when they served several dealers. With one dealer they change
nothing.

Getting the **location** wrong still leaks one rooftop's data to another, so read this before adding any table or
query.

## Location: explicit, and only for location-scoped data

Some data belongs to the whole client and some to one location. **There is no automatic filter for locations.** Every
query of location-scoped data must filter by the user's selected location (`userContext.locationId`), and every
location-scoped table must have a `location_id` column.

| Shared by all of the client's locations  | Belongs to one location                              |
| ---------------------------------------- | ---------------------------------------------------- |
| part master (number, description, price) | part inventory: bin, quantity on hand, reorder level |
| part photos                              | bins                                                 |
| vendors                                  | customers (each location keeps its own book)         |
| users (with a role per location)         | customers' cars (with their customer), appointments  |
|                                          | documents attached to location-scoped records        |

### Unique across the client, owned by one location

Something that is unique in the real world (a part number, a car's VIN) is unique across the **client**, all its
locations, even when the record that holds it belongs to one location. Check it with a query across every location and
a unique index on the value alone (not on `location_id`), and answer a duplicate with `409`. When the duplicate is at another location, say which location, but
never return that location's records: a refusal must not leak another location's customer.

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

1. The location comes from `x-location-id`, validated against the user's token. **Never take a location id from a
   request body or query string** — it would let a user act on a location they do not work at.
2. Every query of location-scoped data filters by the user's location, `requireLocation(userContext)`, in its own
   `where` (see the bins, customers and stock handlers).
3. Never cache location-scoped data under a key that does not include the location.
4. A list endpoint for location-scoped data returns 400 when no location is selected.
