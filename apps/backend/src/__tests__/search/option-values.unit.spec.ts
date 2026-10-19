import { toOptionValues } from "../../search/helpers/option-values"

describe("toOptionValues", () => {
  it("returns an empty list for absent or empty options", () => {
    expect(toOptionValues(undefined)).toEqual([])
    expect(toOptionValues(null)).toEqual([])
    expect(toOptionValues([])).toEqual([])
  })

  it("ignores missing rows and missing or empty value lists", () => {
    expect(toOptionValues([
      null,
      { title: "Size" },
      { title: "Color", values: null },
      { title: "Material", values: [] },
    ])).toEqual([])
  })

  it("ignores missing and blank titles even when they have values", () => {
    expect(toOptionValues([
      { values: [{ value: "S" }] },
      { title: null, values: [{ value: "S" }] },
      { title: "", values: [{ value: "S" }] },
      { title: " \t\n ", values: [{ value: "S" }] },
      { title: "Size", values: [{ value: "M" }] },
    ])).toEqual(["Size:M"])
  })

  it("ignores missing and blank values while preserving valid values", () => {
    expect(toOptionValues([
      {
        title: "Size",
        values: [null, {}, { value: null }, { value: "" }, { value: " \t\n " }, { value: "M" }],
      },
    ])).toEqual(["Size:M"])
  })

  it("trims titles and values without changing internal whitespace", () => {
    expect(toOptionValues([
      { title: " \t Finish \n", values: [{ value: " \t Brushed Steel \n" }] },
    ])).toEqual(["Finish:Brushed Steel"])
  })

  it("deduplicates normalized title-value pairs in first-seen order", () => {
    expect(toOptionValues([
      { title: " Size ", values: [{ value: " M " }, { value: "S" }, { value: "M" }] },
      { title: "Size", values: [{ value: " S " }, { value: "L" }] },
      { title: "Fit", values: [{ value: "M" }] },
    ])).toEqual(["Size:M", "Size:S", "Size:L", "Fit:M"])
  })
})
