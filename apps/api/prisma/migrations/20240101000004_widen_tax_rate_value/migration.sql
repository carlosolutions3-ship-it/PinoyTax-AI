-- tax_rates_history.rate_value was NUMERIC(8,5) (max absolute value just
-- under 1,000), which only fits percentage-shaped rates. The same column is
-- also used to store the VAT registration threshold rule
-- (VAT_REGISTRATION_THRESHOLD, an absolute peso amount read directly by
-- ComplianceService.checkVatClassificationRisk), which overflows at that
-- precision. Widen to match the monetary precision used elsewhere in this
-- schema (e.g. payslips, tax_computations use NUMERIC(14,2)) while keeping
-- 5 decimal places for fine-grained rates.
ALTER TABLE tax_engine.tax_rates_history
  ALTER COLUMN rate_value TYPE NUMERIC(14, 5);
