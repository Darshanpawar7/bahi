export interface IndianState {
  code: string;
  name: string;
}

/** GST state codes. */
export const STATES: readonly IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

const BY_CODE = new Map(STATES.map(state => [state.code, state]));

/** Union territories without a legislature charge UTGST where a state would charge SGST. */
const UNION_TERRITORY_TAX = new Set(['04', '26', '31', '35', '38', '97']);

export function stateName(code: string): string {
  return BY_CODE.get(code)?.name ?? '';
}

export function isStateCode(code: string): boolean {
  return BY_CODE.has(code);
}

/** "Karnataka (29)", as a place of supply is printed on an invoice. */
export function placeOfSupplyLabel(code: string): string {
  const name = stateName(code);
  return name ? `${name} (${code})` : '';
}

export function stateTaxLabel(code: string): 'SGST' | 'UTGST' {
  return UNION_TERRITORY_TAX.has(code) ? 'UTGST' : 'SGST';
}
