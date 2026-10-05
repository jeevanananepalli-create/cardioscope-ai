import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { PatientForm } from "@/components/dashboard/PatientForm";
import { SafetyDisclaimer } from "@/components/dashboard/SafetyDisclaimer";
import { SAFETY_DISCLAIMER } from "@/lib/constants";
import { emptyFormValues, typicalFormValues, validatePatient } from "@/lib/validation";
import type { FieldErrors, FormValues, PatientFeatures } from "@/types/patient";

import { schemaFixture, validFeatures } from "./fixtures";

function Harness({ onValid, initial }: { onValid: (features: PatientFeatures) => void; initial?: FormValues }) {
  const [values, setValues] = useState<FormValues>(initial ?? emptyFormValues(schemaFixture));
  const [errors, setErrors] = useState<FieldErrors>({});
  return (
    <PatientForm
      schema={schemaFixture}
      values={values}
      errors={errors}
      busy={false}
      onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
      onSubmit={() => {
        const result = validatePatient(schemaFixture, values);
        setErrors(result.errors);
        if (result.features) onValid(result.features);
      }}
      onFillTypical={() => setValues(typicalFormValues(schemaFixture))}
      onClear={() => setValues(emptyFormValues(schemaFixture))}
    />
  );
}

describe("SafetyDisclaimer", () => {
  it("shows the required disclaimer text in full", () => {
    render(<SafetyDisclaimer />);
    const note = screen.getByRole("note", { name: /safety disclaimer/i });
    expect(note).toHaveTextContent(SAFETY_DISCLAIMER);
    expect(note).toHaveTextContent("It is not a medical device");
  });
});

describe("PatientForm", () => {
  it("builds a control for every input feature in the schema, grouped", () => {
    render(<Harness onValid={() => {}} />);
    expect(screen.getByLabelText(/^Age/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Height/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Sex/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Diabetes mellitus" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Bundle branch block/)).toBeInTheDocument();
    for (const title of ["Demographic", "History and risk factors", "ECG"]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it("does not offer derived features or prediction targets as inputs", () => {
    render(<Harness onValid={() => {}} />);
    expect(screen.queryByLabelText(/^Body mass index$/)).not.toBeInTheDocument();
    for (const forbidden of ["LAD", "LCX", "RCA", "Cath"]) {
      expect(screen.queryByLabelText(new RegExp(`^${forbidden}`))).not.toBeInTheDocument();
    }
  });

  it("shows friendly messages and does not submit when fields are missing", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    expect(onValid).not.toHaveBeenCalled();
    expect(screen.getByText("Age is required.")).toBeInTheDocument();
    expect(screen.getByText(/8 fields need attention/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Age/)).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects an out-of-range value instead of changing it", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} initial={typicalFormValues(schemaFixture)} />);
    const age = screen.getByLabelText(/^Age/);
    await userEvent.clear(age);
    await userEvent.type(age, "500");
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    expect(onValid).not.toHaveBeenCalled();
    expect(screen.getByText("Age must be between 18 and 110 years.")).toBeInTheDocument();
    expect(age).toHaveValue("500");
  });

  it("submits typed values keyed by dataset column name", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} />);
    await userEvent.click(screen.getByRole("button", { name: "Fill typical values" }));
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    expect(onValid).toHaveBeenCalledWith(validFeatures);
  });

  it("lets the user change binary and categorical inputs", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} initial={typicalFormValues(schemaFixture)} />);
    const diabetes = screen.getByRole("group", { name: "Diabetes mellitus" });
    await userEvent.click(within(diabetes).getByRole("radio", { name: "Yes" }));
    await userEvent.selectOptions(screen.getByLabelText(/^Sex/), "Female");
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    expect(onValid).toHaveBeenCalledWith({ ...validFeatures, DM: 1, Sex: "Female" });
  });

  it("shows BMI computed from weight and height", async () => {
    render(<Harness onValid={() => {}} />);
    await userEvent.type(screen.getByLabelText(/^Weight/), "81");
    await userEvent.type(screen.getByLabelText(/^Height/), "180");
    expect(screen.getByLabelText("Computed body mass index")).toHaveTextContent("25.0 kg/m²");
    expect(screen.getByLabelText("Computed body mass index")).toHaveTextContent("Yes");
  });

  it("warns, without blocking, when a value is outside the training range", async () => {
    const onValid = vi.fn();
    render(<Harness onValid={onValid} initial={typicalFormValues(schemaFixture)} />);
    const age = screen.getByLabelText(/^Age/);
    await userEvent.clear(age);
    await userEvent.type(age, "95");
    expect(screen.getByText(/Outside the range seen in training \(30–86\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Analyze Patient" }));
    expect(onValid).toHaveBeenCalledWith({ ...validFeatures, Age: 95 });
  });
});
