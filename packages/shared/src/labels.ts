/**
 * User-facing terminology for AV Creation. Internal names (Job, Client, SubBill, MainBill) stay in code,
 * routes and the database; the UI always uses these labels.
 */
export const L = {
  job: "Challan",
  jobs: "Challans",
  jobFull: "Job Work Challan",
  jobNumber: "Challan No.",
  client: "Job Worker",
  clients: "Job Workers",
  worker: "Worker",
  return: "Job Work Return",
  returns: "Returns",
  subBill: "Payment Voucher",
  subBills: "Payment Vouchers",
  mainBill: "Final Settlement",
  mainBills: "Final Settlements",
  material: "Material",
  materials: "Materials",
  jobWorkType: "Job Work Type",
  jobWorkTypes: "Job Work Types",
  dispatch: "Material Issue",
} as const;
