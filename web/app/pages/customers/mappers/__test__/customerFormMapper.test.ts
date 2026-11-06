import { describe, expect, it } from "vitest";
import { toCustomerInput, toFormValues } from "../customerFormMapper";

describe("customerFormMapper", () => {
  it("starts a new customer empty, as a prospect", () => {
    expect(toFormValues(null)).toEqual({
      firstName: "",
      surname: "",
      companyName: "",
      email: "",
      phone: "",
      city: "",
      status: "prospect",
      lastContactDate: "",
    });
  });

  it("sends every field, trimmed, with an empty or blank one as null so the API clears it", () => {
    const input = toCustomerInput({
      firstName: "  Amara ",
      surname: "Okafor",
      companyName: "",
      email: "   ",
      phone: " 0113 496 0000 ",
      city: "Leeds",
      status: "active",
      lastContactDate: "",
    });

    expect(input).toEqual({
      firstName: "Amara",
      surname: "Okafor",
      companyName: null,
      email: null,
      phone: "0113 496 0000",
      city: "Leeds",
      status: "active",
      lastContactDate: null,
    });
  });

  it("gives back the form a saved customer started from", () => {
    const saved = toCustomerInput({
      firstName: "Bo",
      surname: "Birch",
      companyName: "Birch & Co",
      email: "bo@birch.test",
      phone: "",
      city: "York",
      status: "active",
      lastContactDate: "2026-10-01",
    });

    expect(toCustomerInput(toFormValues(saved))).toEqual(saved);
  });
});
