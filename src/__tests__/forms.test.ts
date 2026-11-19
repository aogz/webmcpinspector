// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { estimateFormSchema, fillForm, findForm, formKey, readFields } from "../extension/forms";

beforeEach(() => {
  document.body.innerHTML = `
    <form id="book" toolname="bookTable" tooldescription="Book a table">
      <label for="guests">Guests</label>
      <input id="guests" name="guests" type="number" min="1" max="8" step="1" required>
      <input name="date" type="date" toolparamdescription="Day of the visit">
      <input type="radio" name="seating" value="inside">
      <input type="radio" name="seating" value="terrace">
      <input type="checkbox" name="extras" value="cake">
      <input type="checkbox" name="extras" value="flowers">
      <input type="checkbox" name="newsletter">
      <select name="time"><option value="">Pick</option><option value="19:00">7pm</option></select>
      <input type="hidden" name="token" value="x">
      <button>Book</button>
    </form>
    <form action="/search"><input name="q"></form>
    <form action="/search"><input name="q"></form>`;
});

describe("forms", () => {
  it("derives a schema like the declarative explainer", () => {
    const schema = estimateFormSchema(document.querySelector("form")!);
    expect(schema.required).toEqual(["guests"]);
    expect(schema.properties?.guests).toMatchObject({ type: "integer", minimum: 1, maximum: 8, description: "Guests" });
    expect(schema.properties?.date).toMatchObject({ type: "string", format: "date", description: "Day of the visit" });
    expect(schema.properties?.seating).toMatchObject({ type: "string", enum: ["inside", "terrace"] });
    expect(schema.properties?.extras).toMatchObject({ type: "array", items: { enum: ["cake", "flowers"] } });
    expect(schema.properties?.newsletter).toMatchObject({ type: "boolean" });
    expect(schema.properties?.time).toMatchObject({ enum: ["19:00"] });
    expect(schema.properties?.token).toBeUndefined();
  });

  it("collapses radio and checkbox groups into one field", () => {
    const fields = readFields(document.querySelector("form")!);
    expect(fields.map((f) => f.name)).toEqual(["guests", "date", "seating", "extras", "newsletter", "time"]);
    expect(fields.find((f) => f.name === "seating")?.options).toEqual(["inside", "terrace"]);
  });

  it("gives stable, distinct keys", () => {
    const forms = Array.from(document.querySelectorAll("form"));
    expect(forms.map((f) => formKey(f, forms))).toEqual(["#book", 'form[action="/search"]:0', 'form[action="/search"]:1']);
    expect(findForm('form[action="/search"]:1')).toBe(forms[2]);
  });

  it("fills fields and leaves submission to the user without toolautosubmit", () => {
    const form = document.querySelector("form")!;
    const result = fillForm(form, { guests: 2, seating: "terrace", extras: ["cake"], newsletter: true, time: "19:00" });
    expect(result.submitted).toBe(false);
    expect((form.elements.namedItem("guests") as HTMLInputElement).value).toBe("2");
    expect((form.querySelector('[value="terrace"]') as HTMLInputElement).checked).toBe(true);
    expect((form.querySelector('[value="cake"]') as HTMLInputElement).checked).toBe(true);
    expect((form.querySelector('[value="flowers"]') as HTMLInputElement).checked).toBe(false);
    expect((form.elements.namedItem("time") as HTMLSelectElement).value).toBe("19:00");
  });
});
