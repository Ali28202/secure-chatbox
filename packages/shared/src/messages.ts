import { ERROR_CODES, type ErrorCode } from './constants';

export const FA_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.VALIDATION_ERROR]: 'اطلاعاتی که فرستادی درست نیست.',
  [ERROR_CODES.UNAUTHORIZED]: 'برای این کار باید وارد حسابت بشی.',
  [ERROR_CODES.DEVICE_MISMATCH]:
    'حسابت روی یه دستگاه دیگه وارد شده. برای ادامه، دوباره از همین‌جا وارد شو.',
  [ERROR_CODES.FORBIDDEN]: 'اجازهٔ این کار رو نداری.',
  [ERROR_CODES.NOT_FOUND]: 'چیزی که خواستی پیدا نشد.',
  [ERROR_CODES.CONFLICT]: 'این از قبل هست.',
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 'حجم چیزی که فرستادی بیشتر از حد مجازه.',
  [ERROR_CODES.RATE_LIMITED]: 'زیادی درخواست فرستادی. یه کم بعد دوباره امتحان کن.',
  [ERROR_CODES.INTERNAL_ERROR]: 'یه خطای غیرمنتظره تو سرور پیش اومد. دوباره امتحان کن.',
};
