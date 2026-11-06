# QA ACME-106

## QA results: PASS

- [x] **T1** PASS: maria @ Riverside Home shows Kemi Adeyemi, Rory Doyle, Liam Byrne, Olivia Nowak, Noah Fischer (newest first); all 5 are in Riverside's list of 7 (T1, T1b screenshots)
- [x] **T2** PASS: sam @ Northside Home shows Dev Patel, Isla McKenzie, Amara Okafor, Ben Whitaker, Grace Hopper; all in Northside's 10; none among Maria's five (T2, T2b)
- [x] **T3** PASS: clicking Kemi Adeyemi opens her record ("Customer of Riverside"); API `GET /customers/{id}` for all 5 recent ids as maria @ Riverside returned 200 (T3)
- [x] **T4** PASS: maria switched to Westgate: Sophie Lindqvist, Tariq Hussain, Wren Ashworth, Victor Mensah, Yusuf Demir, only Westgate (T4)
- [x] **T5** PASS (API): `bun run api as rita --location westgate --body GET /api/dealership/v1/customers/recent`: 5 customers, all in Westgate list of 6
- [x] **T6** PASS (API): tom @ Central recent: 2 customers (Omar Farooq, Zara Ahmed), all in his list of 3; `GET /customers/<Northside id>` as tom: 404
- [x] **T7** PASS (API): `bun run api as sam --location northside GET /api/dealership/v1/customers/<Riverside id>`: 404 Not Found
- [x] **T8** PASS: reload of Home as maria @ Riverside keeps Riverside's 5 customers (T8)
- [x] **T9** PASS (API): maria recent dates 2026-10-26, 10-23, 10-18, 10-11, 2026-04-02: descending

Not tested: "no location" 400 (api tool always sends a location).
