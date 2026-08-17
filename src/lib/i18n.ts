/**
 * Premium Staycations — Phase 2a
 * Locales for the customer site.
 *
 * Two locales, route-segmented (/en, /ar), Arabic rendered RTL. UI chrome
 * strings live here; legal and money copy does NOT — that comes from the
 * `strings` table, where locked rows are trigger-protected. The rule: if the
 * words could end up in a complaint, they are data, not code.
 */

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function dirOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/** Substitute {{placeholders}} in a strings-table row. */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in values ? String(values[key]) : `{{${key}}}`,
  );
}

const DICTIONARY = {
  brand_name: { en: 'Premium Staycations', ar: 'بريميوم ستيكيشنز' },
  tagline: {
    en: 'UAE staycations, one honest price',
    ar: 'إقامات فندقية في الإمارات، بسعر واحد صريح',
  },
  browse_stays: { en: 'Browse stays', ar: 'تصفح الإقامات' },
  emirate_dubai: { en: 'Dubai', ar: 'دبي' },
  emirate_abu_dhabi: { en: 'Abu Dhabi', ar: 'أبوظبي' },
  emirate_rak: { en: 'Ras Al Khaimah', ar: 'رأس الخيمة' },
  star_hotel: { en: 'hotel', ar: 'فندق' },
  area_label: { en: 'Area', ar: 'المنطقة' },
  check_in: { en: 'Check-in', ar: 'تاريخ الوصول' },
  check_out: { en: 'Check-out', ar: 'تاريخ المغادرة' },
  rooms: { en: 'Rooms', ar: 'الغرف' },
  adults: { en: 'Adults', ar: 'البالغون' },
  children: { en: 'Children', ar: 'الأطفال' },
  child_dob: { en: 'Child date of birth', ar: 'تاريخ ميلاد الطفل' },
  child_dob_note: {
    en: 'Children are priced by their age on the check-in date.',
    ar: 'تُحتسب أسعار الأطفال حسب أعمارهم في تاريخ الوصول.',
  },
  add_child: { en: 'Add child', ar: 'إضافة طفل' },
  see_package: { en: 'See package price', ar: 'عرض سعر الباقة' },
  your_stay: { en: 'Your stay', ar: 'إقامتك' },
  nights: { en: 'nights', ar: 'ليالٍ' },
  night: { en: 'night', ar: 'ليلة' },
  add_ons: { en: 'Add experiences', ar: 'أضف تجارب' },
  per_adult: { en: 'per adult', ar: 'للبالغ' },
  per_child: { en: 'per child', ar: 'للطفل' },
  free_for_infants: { en: 'free for infants', ar: 'مجاناً للرضّع' },
  package_total: { en: 'Package total', ar: 'إجمالي الباقة' },
  payable_at_hotel: { en: 'Payable at the hotel', ar: 'يُدفع في الفندق' },
  continue_to_checkout: { en: 'Continue to checkout', ar: 'المتابعة إلى الدفع' },
  not_bookable_online: {
    en: 'This stay cannot be booked online yet',
    ar: 'لا يمكن حجز هذه الإقامة عبر الإنترنت بعد',
  },
  enquiry_pitch: {
    en: 'Leave your details and our team will price it for you within a day.',
    ar: 'اترك بياناتك وسيقوم فريقنا بتسعيرها لك خلال يوم واحد.',
  },
  send_enquiry: { en: 'Send enquiry', ar: 'إرسال الطلب' },
  enquiry_sent: {
    en: 'Received — our team will be in touch shortly.',
    ar: 'تم الاستلام — سيتواصل معك فريقنا قريباً.',
  },
  guest_details: { en: 'Guest details', ar: 'بيانات الضيوف' },
  lead_guest: { en: 'Lead guest', ar: 'الضيف الرئيسي' },
  guest: { en: 'Guest', ar: 'ضيف' },
  full_name: { en: 'Full name', ar: 'الاسم الكامل' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  phone: { en: 'Phone', ar: 'الهاتف' },
  date_of_birth: { en: 'Date of birth', ar: 'تاريخ الميلاد' },
  optional: { en: 'optional', ar: 'اختياري' },
  accept_terms: {
    en: 'I understand the fee payable at the hotel and accept the booking terms.',
    ar: 'أفهم الرسم المستحق الدفع في الفندق وأوافق على شروط الحجز.',
  },
  pay_securely: { en: 'Continue to secure payment', ar: 'المتابعة إلى الدفع الآمن' },
  payment_title: { en: 'Secure payment', ar: 'الدفع الآمن' },
  payment_note: {
    en: 'You are paying Premium Staycations for booking',
    ar: 'أنت تدفع لبريميوم ستيكيشنز مقابل الحجز',
  },
  pay_now: { en: 'Pay now', ar: 'ادفع الآن' },
  decline_payment: { en: 'Simulate a declined card', ar: 'محاكاة رفض البطاقة' },
  payment_declined: {
    en: 'The payment was declined. No money was taken — you can try again.',
    ar: 'تم رفض عملية الدفع. لم يتم خصم أي مبلغ — يمكنك المحاولة مرة أخرى.',
  },
  booking_confirmed: { en: 'Booking confirmed', ar: 'تم تأكيد الحجز' },
  booking_reference: { en: 'Booking reference', ar: 'رقم الحجز' },
  your_vouchers: { en: 'Your vouchers', ar: 'قسائمك' },
  voucher_code: { en: 'Voucher code', ar: 'رمز القسيمة' },
  booking_failed_title: {
    en: 'We could not complete your booking',
    ar: 'لم نتمكن من إتمام حجزك',
  },
  amount_paid: { en: 'Amount paid', ar: 'المبلغ المدفوع' },
  guests_label: { en: 'Guests', ar: 'الضيوف' },
  back_home: { en: 'Back to all stays', ar: 'العودة إلى جميع الإقامات' },
  processing: { en: 'Processing…', ar: 'جارٍ المعالجة…' },
} as const;

export type DictionaryKey = keyof typeof DICTIONARY;

export function t(locale: Locale, key: DictionaryKey): string {
  return DICTIONARY[key][locale];
}

export function emirateName(locale: Locale, emirate: string): string {
  switch (emirate) {
    case 'dubai':     return t(locale, 'emirate_dubai');
    case 'abu_dhabi': return t(locale, 'emirate_abu_dhabi');
    case 'rak':       return t(locale, 'emirate_rak');
    default:          return emirate;
  }
}
