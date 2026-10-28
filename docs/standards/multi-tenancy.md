# Dealers and locations

Acme DMS serves many dealers from one deployment. Getting scoping wrong leaks one customer's data to another, so read
this before adding any table or query.

## Dealer (the tenant): enforced automatically

Every dealer-owned row has a `dealer_id`.

- **.NET (EF Core):** a global query filter on `DealerId` is applied from the user's token. Background work has no
  signed-in user and must call `IgnoreQueryFilters()` explicitly, then match the dealer itself.
- **NestJS (TypeORM):** repositories extend `DealerScopedRepository`. Every read starts from `forDealer(dealerId)` and
  every write is checked with `assertSameDealer`.

## Location: explicit, and only for location-scoped data

Some data belongs to the whole dealer and some to one location. **There is no automatic filter for locations.** Every
query of location-scoped data must filter by the user's selected location (`userContext.locationId`), and every
location-scoped table must have a `location_id` column.

| Shared by all of a dealer's locations    | Belongs to one location                              |
| ---------------------------------------- | ---------------------------------------------------- |
| part master (number, description, price) | part inventory: bin, quantity on hand, reorder level |
| part photos                              | bins                                                 |
| vendors                                  | customers (each location keeps its own book)         |
| users (with a role per location)         | customers' cars (with their customer), appointments  |
|                                          | documents attached to location-scoped records        |

### Unique across the dealer, owned by one location

Something that is unique in the real world (a part number, a car's VIN) is unique across the **dealer**, even when the
record that holds it belongs to one location. Check it with a dealer-wide query and a unique index on
`(dealer_id, …)`, and answer a duplicate with `409`. When the duplicate is at another location, say which location, but
never return that location's records: a refusal must not leak another location's customer.

### Parts live in a location's inventory

A part number is unique across the dealer, but **a location only has the parts it stocks**. Every stocked part has a
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
2. A repository method for location-scoped data takes `locationId` as an explicit parameter
   (see `IPartInventoryRepository`, `IBinRepository`, `ICustomerRepository`).
3. Never cache location-scoped data under a key that does not include the location.
4. A list endpoint for location-scoped data returns 400 when no location is selected.
