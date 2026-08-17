/**
 * Premium Staycations — Phase 1
 * The mock inventory: thirty UAE properties across Dubai, Abu Dhabi and RAK.
 *
 * The names are real UAE hotels and the emirate, area and star rating are
 * accurate, because those three fields drive real behaviour — area and emirate
 * select extra eligibility, and star rating selects the Tourism Dirham band.
 * A fixture set of Hotel A, Hotel B and Hotel C would let a scope bug through.
 *
 * Everything commercial — rates, board basis, cancellation windows — is
 * invented. None of it came from a supplier and none of it is a real price.
 *
 * Coordinates are null throughout. No Phase 1 feature reads them, and
 * plausible-looking made-up ones would be worse than an honest absence.
 *
 * Deliberate spread, so the tests have something to bite on:
 *   - Abu Dhabi is represented, because property_fees has no Abu Dhabi rows.
 *     Assembly must raise a task for these, never price the fee as zero.
 *   - Several properties check in at 16:00 rather than the brand default,
 *     which is what makes the lead-time exclusion testable.
 *   - Star ratings run 3 to 5, so every Tourism Dirham band is exercised.
 *   - Two properties report an unknown tax treatment. Unknown is not false.
 */

import type { Emirate } from '../types';

export type BoardBasis =
  | 'room_only'
  | 'bed_and_breakfast'
  | 'half_board'
  | 'full_board'
  | 'all_inclusive';

/**
 * How this property behaves when booked. Absent means it behaves.
 *
 * Failure is fixture data rather than a method on the adapter, so a test
 * triggers a timeout by booking the property that times out. The adapter grows
 * no test-only surface, and the same scenarios are reachable by hand from the
 * admin UI in Session 6.
 */
export type MockBehaviour =
  | 'sold_out_on_book'
  | 'price_moves_on_book'
  | 'timeout_on_book'
  | 'timeout_on_book_but_succeeds'
  | 'rejects_guests';

export interface MockProperty {
  externalPropertyId: string;
  name: string;
  emirate: Emirate;
  area: string | null;
  starRating: number | null;
  /** 'HH:MM'. Null means the supplier did not say; the brand default applies. */
  checkInTime: string | null;
  checkOutTime: string | null;

  /** AED per room per night before the seasonal and weekend adjustments. */
  baseNetRate: number;
  boardBasis: BoardBasis;
  /** Null means the supplier did not state a tax treatment. */
  netRateTaxInclusive: boolean | null;
  /** Free cancellation window in days before check-in. Null means non-refundable. */
  freeCancelDays: number | null;

  behaviour?: MockBehaviour;
}

// ---------------------------------------------------------------------------
// Dubai — 16
// ---------------------------------------------------------------------------

const DUBAI: MockProperty[] = [
  {
    externalPropertyId: 'DXB-001',
    name: 'Atlantis The Palm',
    emirate: 'dubai',
    area: 'Palm Jumeirah',
    starRating: 5,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    baseNetRate: 1450,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 7,
  },
  {
    externalPropertyId: 'DXB-002',
    name: 'Jumeirah Beach Hotel',
    emirate: 'dubai',
    area: 'Umm Suqeim',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 1180,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'DXB-003',
    name: 'Burj Al Arab Jumeirah',
    emirate: 'dubai',
    area: 'Umm Suqeim',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 4200,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 14,
  },
  {
    externalPropertyId: 'DXB-004',
    name: 'Address Downtown',
    emirate: 'dubai',
    area: 'Downtown Dubai',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 980,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
  },
  {
    externalPropertyId: 'DXB-005',
    name: 'Rove Downtown',
    emirate: 'dubai',
    area: 'Downtown Dubai',
    starRating: 3,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 320,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 1,
  },
  {
    externalPropertyId: 'DXB-006',
    name: 'Hilton Dubai Jumeirah',
    emirate: 'dubai',
    area: 'Jumeirah Beach Residence',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 760,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'DXB-007',
    name: 'Rixos Premium Dubai JBR',
    emirate: 'dubai',
    area: 'Jumeirah Beach Residence',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 1320,
    boardBasis: 'all_inclusive',
    netRateTaxInclusive: true,
    freeCancelDays: 5,
  },
  {
    externalPropertyId: 'DXB-008',
    name: 'Media One Hotel',
    emirate: 'dubai',
    area: 'Dubai Media City',
    starRating: 4,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 410,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 1,
  },
  {
    externalPropertyId: 'DXB-009',
    name: 'Grand Hyatt Dubai',
    emirate: 'dubai',
    area: 'Bur Dubai',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 690,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'DXB-010',
    name: 'Hyatt Regency Dubai Creek Heights',
    emirate: 'dubai',
    area: 'Deira',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 540,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
  },
  {
    externalPropertyId: 'DXB-011',
    name: 'Novotel Al Barsha',
    emirate: 'dubai',
    area: 'Al Barsha',
    starRating: 4,
    checkInTime: '14:00',
    checkOutTime: '12:00',
    baseNetRate: 360,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 1,
  },
  {
    externalPropertyId: 'DXB-012',
    name: 'Le Meridien Mina Seyahi Beach Resort',
    emirate: 'dubai',
    area: 'Dubai Marina',
    starRating: 5,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    baseNetRate: 890,
    boardBasis: 'half_board',
    netRateTaxInclusive: true,
    freeCancelDays: 4,
  },
  {
    externalPropertyId: 'DXB-013',
    name: 'Radisson Blu Hotel Dubai Waterfront',
    emirate: 'dubai',
    area: 'Business Bay',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 470,
    boardBasis: 'bed_and_breakfast',
    // The supplier does not state a tax treatment for this contract. Unknown
    // must reach assembly as unknown and raise a task there.
    netRateTaxInclusive: null,
    freeCancelDays: 2,
  },
  {
    externalPropertyId: 'DXB-014',
    name: 'Citymax Hotel Al Barsha',
    emirate: 'dubai',
    area: 'Al Barsha',
    starRating: 3,
    checkInTime: '14:00',
    checkOutTime: '12:00',
    baseNetRate: 240,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: null,
  },
  {
    externalPropertyId: 'DXB-015',
    name: 'One and Only Royal Mirage',
    emirate: 'dubai',
    area: 'Al Sufouh',
    starRating: 5,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    baseNetRate: 1650,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 7,
  },
  {
    externalPropertyId: 'DXB-016',
    name: 'Anantara The Palm Dubai Resort',
    emirate: 'dubai',
    area: 'Palm Jumeirah',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 1090,
    boardBasis: 'half_board',
    netRateTaxInclusive: true,
    freeCancelDays: 5,
  },
];

// ---------------------------------------------------------------------------
// Abu Dhabi — 7
//
// property_fees deliberately has no Abu Dhabi rows: the Tourism Dirham
// treatment there is unconfirmed against WebBeds certification. These
// properties exist so that gap is exercised rather than discovered in
// production. fees_for_property() returns nothing for them and assembly must
// raise a task rather than price the fee at zero.
// ---------------------------------------------------------------------------

const ABU_DHABI: MockProperty[] = [
  {
    externalPropertyId: 'AUH-001',
    name: 'Emirates Palace Mandarin Oriental',
    emirate: 'abu_dhabi',
    area: 'Corniche',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 1580,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 7,
  },
  {
    externalPropertyId: 'AUH-002',
    name: 'Rosewood Abu Dhabi',
    emirate: 'abu_dhabi',
    area: 'Al Maryah Island',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 720,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'AUH-003',
    name: 'W Abu Dhabi Yas Island',
    emirate: 'abu_dhabi',
    area: 'Yas Island',
    starRating: 5,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    baseNetRate: 810,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
  },
  {
    externalPropertyId: 'AUH-004',
    name: 'Park Hyatt Abu Dhabi Hotel and Villas',
    emirate: 'abu_dhabi',
    area: 'Saadiyat Island',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 950,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 5,
  },
  {
    externalPropertyId: 'AUH-005',
    name: 'Radisson Blu Hotel Abu Dhabi Yas Island',
    emirate: 'abu_dhabi',
    area: 'Yas Island',
    starRating: 4,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 430,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 1,
  },
  {
    externalPropertyId: 'AUH-006',
    name: 'Aloft Abu Dhabi',
    emirate: 'abu_dhabi',
    area: 'Al Zahiyah',
    starRating: 4,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 380,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 1,
  },
  {
    externalPropertyId: 'AUH-007',
    name: 'Qasr Al Sarab Desert Resort by Anantara',
    emirate: 'abu_dhabi',
    area: 'Liwa Desert',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 1240,
    boardBasis: 'half_board',
    netRateTaxInclusive: true,
    freeCancelDays: 14,
  },
];

// ---------------------------------------------------------------------------
// Ras Al Khaimah — 7
// ---------------------------------------------------------------------------

const RAK: MockProperty[] = [
  {
    externalPropertyId: 'RAK-001',
    name: 'Waldorf Astoria Ras Al Khaimah',
    emirate: 'rak',
    area: 'Al Hamra',
    starRating: 5,
    checkInTime: '16:00',
    checkOutTime: '12:00',
    baseNetRate: 890,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 5,
  },
  {
    externalPropertyId: 'RAK-002',
    name: 'Rixos Bab Al Bahr',
    emirate: 'rak',
    area: 'Al Marjan Island',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 1020,
    boardBasis: 'all_inclusive',
    netRateTaxInclusive: true,
    freeCancelDays: 7,
  },
  {
    externalPropertyId: 'RAK-003',
    name: 'DoubleTree by Hilton Resort and Spa Marjan Island',
    emirate: 'rak',
    area: 'Al Marjan Island',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 560,
    boardBasis: 'half_board',
    netRateTaxInclusive: true,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'RAK-004',
    name: 'Hilton Ras Al Khaimah Beach Resort',
    emirate: 'rak',
    area: 'Al Maareedh',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 620,
    boardBasis: 'half_board',
    // Second unknown tax treatment, in a different emirate to the first, so a
    // test cannot pass by special-casing Dubai.
    netRateTaxInclusive: null,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'RAK-005',
    name: 'Movenpick Resort Al Marjan Island',
    emirate: 'rak',
    area: 'Al Marjan Island',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 580,
    boardBasis: 'bed_and_breakfast',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
  },
  {
    externalPropertyId: 'RAK-006',
    name: 'The Cove Rotana Resort',
    emirate: 'rak',
    area: 'Ras Al Khaimah',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 640,
    boardBasis: 'half_board',
    netRateTaxInclusive: true,
    freeCancelDays: 3,
  },
  {
    externalPropertyId: 'RAK-007',
    name: 'Bab Al Nojoum Bassata',
    emirate: 'rak',
    area: 'Al Jazirah Al Hamra',
    starRating: 3,
    checkInTime: '14:00',
    checkOutTime: '11:00',
    baseNetRate: 290,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: null,
  },
];

/** The thirty. Failure scenarios live in scenarios.ts and are added on top. */
export const MOCK_PROPERTIES: MockProperty[] = [...DUBAI, ...ABU_DHABI, ...RAK];
