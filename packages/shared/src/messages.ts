import { ERROR_CODES, type ErrorCode } from './constants';

export const FA_ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.VALIDATION_ERROR]: 'اطلاعات واردشده معتبر نیست.',
  [ERROR_CODES.UNAUTHORIZED]: 'برای انجام این کار باید وارد حساب کاربری خود شوید.',
  [ERROR_CODES.DEVICE_MISMATCH]:
    'حساب شما روی دستگاه دیگری وارد شده است. برای ادامه، دوباره از همین دستگاه وارد شوید.',
  [ERROR_CODES.FORBIDDEN]: 'شما اجازهٔ انجام این کار را ندارید.',
  [ERROR_CODES.NOT_FOUND]: 'موردی که درخواست کردید پیدا نشد.',
  [ERROR_CODES.CONFLICT]: 'این مورد از پیش وجود دارد.',
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 'حجم اطلاعات ارسالی بیش از حد مجاز است.',
  [ERROR_CODES.RATE_LIMITED]: 'تعداد درخواست‌های شما بیش از حد مجاز است. کمی بعد دوباره تلاش کنید.',
  [ERROR_CODES.INTERNAL_ERROR]: 'خطای پیش‌بینی‌نشده‌ای در سرور رخ داد. لطفاً دوباره تلاش کنید.',
};
