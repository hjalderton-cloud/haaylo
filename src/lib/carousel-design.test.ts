import { describe, expect, it } from "vitest";
import { buildCarouselDesigns, extractBrandColours, resolveCarouselBrand } from "./carousel-design";

describe("carousel design", () => {
  it("reads every named colour range without duplicates", () => {
    expect(extractBrandColours("Pink: #FF5C93 → #E01F68 Purple: #9B5CFF → #6E1FE0", "#FF5C93")).toEqual([
      "#FF5C93", "#E01F68", "#9B5CFF", "#6E1FE0",
    ]);
  });

  it("uses the fixed Haaylo system", () => {
    const brand = resolveCarouselBrand({ name: "Haaylo.com", colours: "#00FF00", fonts: "Poppins Bold" });
    expect(brand.colours).toEqual(["#171D41", "#FF5C93", "#9B5CFF", "#FFFFFF"]);
    expect(brand.headingFont).toContain("Poppins");
  });

  it("keeps another workspace's own palette", () => {
    const brand = resolveCarouselBrand({ name: "Example Ltd", primary: "#123456", secondary: "#ABCDEF" });
    expect(brand.colours.slice(0, 2)).toEqual(["#123456", "#ABCDEF"]);
  });

  it("creates opening, content and closing designs with exact copy", () => {
    const brand = resolveCarouselBrand({ name: "Haaylo", logoUrl: "https://example.com/logo.png" });
    const designs = buildCarouselDesigns([
      { heading: "The opener", body: "Opening copy" },
      { heading: "The point", body: "Middle copy" },
      { heading: "The ask", body: "Closing copy" },
    ], brand);
    expect(designs.map((item) => item.role)).toEqual(["opening", "content", "closing"]);
    expect(designs[1]?.layers.find((item) => item.id === "heading")?.text).toBe("The point");
    expect(designs[2]?.layers.find((item) => item.id === "body")?.text).toBe("Closing copy");
  });
});