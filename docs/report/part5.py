# -*- coding: utf-8 -*-
"""Chapter 6, references, appendices and the English back matter."""

from builder import (S_BODY, S_EN_BODY, S_EN_COVER, S_EN_DATE, S_EN_TITLE,
                     S_TITLE2)
from part1 import FIELD, STUDENT, SUPERVISOR, TITLE

EN_TITLE = 'Secure Chatbox and Intranet Access Control Platform'
EN_STUDENT = 'Ali Mahallati'
EN_SUPERVISOR = 'Dr. Majid Aghaei'


def chapter6(r, shots, figs):
    r.chapter('جمع‌بندی و پیشنهادها')
    r.section_break('ch_title')

    r.h1('مقدمه')
    r.para(
        'این فصل خلاصه‌ای از یافته‌ها و دستاوردهای پروژه، نوآوری‌های آن، محدودیت‌های '
        'شناخته‌شده و پیشنهادهایی برای ادامهٔ کار ارائه می‌کند.')

    r.h1('محتوا')

    r.h2('جمع‌بندی')
    r.para(
        'در این پروژه یک پلتفرم پیام‌رسان برای شبکهٔ درون‌سازمانی دانشگاه طراحی و '
        'پیاده‌سازی شد. سامانه به‌صورت یک مخزن یکپارچه با چهار فضای کاری ساخته شده و شامل '
        'یک واسط کاربری Next.js، یک واسط برنامه‌نویسی Hono روی زمان‌اجرای Bun، یک پایگاه '
        'دادهٔ PostgreSQL با هشت جدول و یک دروازهٔ بی‌درنگ Socket.IO است.')
    r.para(
        'از نظر کارکردی، سامانه گفت‌وگوی مستقیم و گروهی، کانال فقط‌خواندنی، بی‌صداکردن '
        'عضو، پیوست فایل، رسید تحویل و خواندن، شمارندهٔ پیام نخوانده، پاسخ زنجیره‌ای که پس '
        'از حذف والد نیز پابرجا می‌ماند، پین پیام، واکنش شکلکی، نشانگر تایپ، حضور بی‌درنگ، '
        'جست‌وجوی متنی، آرشیو و حذف نرم گروه، مدیریت نشست توسط خود کاربر و یک کارتابل '
        'مدیریتی برای تأیید ثبت‌نام‌ها را پشتیبانی می‌کند. واسط کاربری یکسره فارسی و '
        'راست‌به‌چپ است و دو پوستهٔ روشن و تاریک دارد.')
    r.para(
        'از نظر امنیتی، ده لایهٔ مستقل روی هر درخواست اعمال می‌شود؛ از محدودیت نرخ در لبهٔ '
        'شبکه تا ارزیابی قواعد مجوزدهی روی ردیف‌هایی که خودِ کارساز بارگذاری کرده است. '
        'درستی این رفتار با ۱۰۹ آزمون سرتاسری در مرورگر واقعی و در ۱۲ پروندهٔ آزمون '
        'راستی‌آزمایی شده و این آزمون‌ها به‌همراه بررسی سبک و بررسی نوع، در هر درخواست ادغام '
        'به‌صورت خودکار اجرا می‌شوند.')
    r.para(
        'از نظر عملیاتی، کل پشته با یک فرمان و پشت nginx با گواهی معتبر مستقر می‌شود، '
        'مهاجرت‌های پایگاه داده بخشی از هر استقرارند، و استقراری که بررسی سلامت را نگذراند '
        'به‌صورت خودکار به نسخهٔ پیشین بازمی‌گردد.')

    r.h2('نوآوری')
    r.para(
        'نوآوری این پروژه در اختراع فناوری تازه نیست؛ در ترکیب و در صریح‌کردن تصمیم‌هایی '
        'است که معمولاً ضمنی می‌مانند. چهار مورد زیر شاخص‌ترین‌اند.')
    r.para(
        '**یک. نشست مقید به دستگاه، بدون تکیه بر شناسهٔ سخت‌افزاری.** بستر وب امکان خواندن '
        'شناسهٔ سخت‌افزاری را نمی‌دهد. راهکار به‌کاررفته، ترکیبی از یک مقدار تصادفی و '
        'پیشوندی از ویژگی‌های مرورگر است که ترتیب آن عامدانه انتخاب شده تا در آزمایشگاه '
        'رایانه، کاربران یکدیگر را اخراج نکنند. این شناسه تنها یک‌بار و در بدنهٔ درخواست '
        'ورود منتقل می‌شود و سپس درون توکن امضاشده زندگی می‌کند.')
    r.para(
        '**دو. تفکیک دوسطحی نقش و تمرکز قواعد در یک نقطه.** جدایی نقش سراسری از نقش '
        'درون‌گفت‌وگو، و افزون بر آن، جدایی «اجازهٔ تعدیل گفت‌وگو» از «اجازهٔ تغییر فهرست '
        'اعضا»، دقتی را ممکن می‌کند که در سامانه‌های عمومی‌منظوره قابل بیان نیست. نگهداری '
        'همهٔ این قواعد در یک پروندهٔ واحد و به‌صورت توابع محض، امکان ارزیابی یکسان آن‌ها در '
        'مرورگر و کارساز را فراهم کرده است.')
    r.para(
        '**سه. گزارش‌گیری که به‌لحاظ ساختاری توان خواندن پیام را ندارد.** استفاده از مجوزهای '
        'در سطح ستون برای نقشی که ابزار گزارش‌گیری با آن متصل می‌شود، این پرسش را از حوزهٔ '
        'اعتماد به حوزهٔ ساختار منتقل می‌کند. ارزش یک داشبورد به‌سرقت‌رفته، دیگر به '
        'خویشتن‌داری کاربرانش بستگی ندارد.')
    r.para(
        '**چهار. انتشار رویداد بی‌درنگ پس از تثبیت تراکنش.** این جزئیات کوچک، یک دستهٔ کامل '
        'از خطاهای دشوار را از میان برمی‌دارد: حالتی که مرورگرِ یک کاربر پیامی را نشان '
        'می‌دهد که در پایگاه داده هرگز ثبت نشده است.')

    r.h2('محدودیت‌های شناخته‌شده')
    r.para(
        'بیان صریح مرزهای یک سامانهٔ دفاعی، بخشی از ارزش آن است. جدول (۶-۱) محدودیت‌های '
        'شناخته‌شده و دلیل هر یک را فهرست می‌کند.')
    r.table(
        'محدودیت‌های شناخته‌شدهٔ سامانه',
        ['محدودیت', 'دلیل و وضعیت'],
        [
            ['شناسهٔ دستگاه یک هویت سخت‌افزاری نیست',
             'بستر وب اجازهٔ خواندن نشانی سخت‌افزاری را نمی‌دهد. این شناسه یک **برچسب** است، نه یک راز؛ پاک‌کردن دادهٔ سایت نشست را پایان می‌دهد و رونوشت‌برداری از حافظهٔ محلی آن را منتقل می‌کند'],
            ['پیوست‌ها می‌توانند از شبکهٔ دانشگاه خارج شوند',
             'وابسته به انتخاب باکت. با اجرای یک ذخیره‌ساز سازگار با S3 روی شبکهٔ خود دانشگاه بسته می‌شود و هیچ چیز دیگری تغییر نمی‌کند'],
            ['تاریخچهٔ ویرایش پیام نگهداری نمی‌شود',
             'ستون ویرایش‌شده یک پرچم است، نه یک گزارش'],
            ['رمزنگاری سرتاسری میان دو کاربر وجود ندارد',
             'خارج از دامنهٔ تعریف‌شده. کارساز به متن پیام دسترسی دارد؛ همین است که جست‌وجوی متنی و گزارش‌گیری را ممکن می‌کند'],
            ['محدودیت نرخ تنها در لبهٔ شبکه است',
             'قفل به‌ازای هر حساب وجود ندارد و یک شبکه پشت یک NAT، یک سهمیه دارد. کد خطای مربوط تعریف شده اما هنوز از سوی خود برنامه صادر نمی‌شود'],
            ['مسیر ذخیره‌سازی فایل آزمون خودکار ندارد',
             'آزمون‌های مربوط به یک باکت زنده نیاز داشتند؛ مجموعه‌ای که بدون سرویس دوم اجرا نمی‌شود، اجرا نمی‌شود. بررسی دستی جایگزین آن است'],
            ['نقاط پایانی آواتار در سند OpenAPI نیستند',
             'سامانه این ناهماهنگی را در محیط توسعه هشدار می‌دهد؛ رفع آن افزودن سه ورودی به سند است'],
            ['اعلان فشاری و تماس صوتی و تصویری وجود ندارد',
             'خارج از دامنهٔ تعریف‌شده'],
            ['منابع دادهٔ گزارش‌گیری دستی پیکربندی می‌شوند',
             'هیچ چیزی در مخزن آن‌ها را تأمین نمی‌کند'],
        ],
        widths=[3.2, 7.3])

    r.h2('پیشنهادها')
    r.para(
        'پیشنهادهای زیر به‌ترتیب نسبت ارزش به هزینه مرتب شده‌اند و هر یک می‌تواند موضوع یک '
        'کار مستقل باشد.')
    r.bullet('**یکپارچه‌سازی با سامانهٔ آموزش دانشگاه.** بزرگ‌ترین گام بعدی همین است: '
             'اگر فهرست دانشجویان هر درس از سامانهٔ آموزش خوانده شود، عضویت گروه‌های درسی '
             'خودکار می‌شود و در پایان هر نیمسال نیز خودکار پایان می‌یابد. این کار، آخرین '
             'بخش دستی مدیریت عضویت را حذف می‌کند.')
    r.bullet('**محدودیت نرخ در سطح برنامه و قفل به‌ازای حساب.** محدودیت مبتنی بر نشانی، یک '
             'شبکهٔ پشت NAT را یکجا مجازات می‌کند. یک شمارندهٔ تلاش ناموفق به‌ازای هر حساب، '
             'دقیق‌تر و عادلانه‌تر است.')
    r.bullet('**اعلان فشاری وب.** با وجود دروازهٔ بی‌درنگ، افزودن اعلان برای کاربری که '
             'زبانه را بسته است، تغییر بزرگی در سودمندی سامانه ایجاد می‌کند.')
    r.bullet('**پوشش خودکار مسیر ذخیره‌سازی.** با بالاآوردن یک ذخیره‌ساز سازگار با S3 '
             'به‌صورت سرویس در همان محیط آزمون، می‌توان شکاف یادشده در بخش ۴-۲-۲ را بست.')
    r.bullet('**تاریخچهٔ ویرایش پیام.** افزودن یک جدول برای نسخه‌های پیشین متن، پرچم '
             'ویرایش‌شده را به گزارشی قابل بازرسی تبدیل می‌کند؛ تغییری در مدل داده است.')
    r.bullet('**نماهای فقط‌خواندنی برای گزارش‌گیری.** ساخت دو نمای عمومی که تنها ستون‌های '
             'مجاز را نمایان کنند، مشکل عملی پرس‌وجوی ستاره‌دار را بدون تضعیف مجوزها حل '
             'می‌کند.')
    r.bullet('**ثبت رویدادهای حسابرسی.** نگهداری سیاههٔ اقدام‌های مدیریتی — تأیید، رد، تغییر '
             'نقش و حذف پیام دیگران — پاسخگویی را از حافظهٔ افراد به داده منتقل می‌کند.')
    r.section_break('ch_body')


def back_matter(r, shots, figs):
    # ---------------- references ----------------
    r.chapter('مراجع', numbered=False)
    r.section_break('ch_title')
    r.para('مراجع', S_TITLE2)
    for ref in [
        'M. Jones, J. Bradley, and N. Sakimura, "JSON Web Token (JWT)", RFC 7519, Internet Engineering Task Force, May 2015.',
        'A. Biryukov, D. Dinu, and D. Khovratovich, "Argon2: New Generation of Memory-Hard Functions for Password Hashing and Other Applications", IEEE European Symposium on Security and Privacy, pp. 292–302, 2016.',
        'S. Josefsson and S. Leonard, "Password Hashing Competition and Argon2", IETF RFC 9106, September 2021.',
        'I. Fette and A. Melnikov, "The WebSocket Protocol", RFC 6455, Internet Engineering Task Force, December 2011.',
        'R. T. Fielding, "Architectural Styles and the Design of Network-based Software Architectures", Ph.D. dissertation, University of California, Irvine, 2000.',
        'D. F. Ferraiolo, R. Sandhu, S. Gavrila, D. R. Kuhn, and R. Chandramouli, "Proposed NIST Standard for Role-Based Access Control", ACM Transactions on Information and System Security, Vol. 4, No. 3, pp. 224–274, 2001.',
        'OWASP Foundation, "OWASP Top 10: The Ten Most Critical Web Application Security Risks", 2021.',
        'OWASP Foundation, "Cheat Sheet Series: Authentication, Session Management, Password Storage and File Upload", 2024.',
        'A. Barth, "HTTP State Management Mechanism", RFC 6265, Internet Engineering Task Force, April 2011.',
        'M. West and M. Goodwin, "Same-Site Cookies", IETF Draft, 2016.',
        'J. Hodges, C. Jackson, and A. Barth, "HTTP Strict Transport Security (HSTS)", RFC 6797, November 2012.',
        'R. Barnes, J. Hoffman-Andrews, D. McCarney, and J. Kasten, "Automatic Certificate Management Environment (ACME)", RFC 8555, March 2019.',
        'P. Leach, M. Mealling, and R. Salz, "A Universally Unique IDentifier (UUID) URN Namespace", RFC 4122, July 2005.',
        'K. Davis, B. Peabody, and P. Leach, "Universally Unique IDentifiers (UUIDs) — Version 7", RFC 9562, May 2024.',
        'E. Rescorla, "The Transport Layer Security (TLS) Protocol Version 1.3", RFC 8446, August 2018.',
        'The PostgreSQL Global Development Group, "PostgreSQL 18 Documentation", 2025.',
        'Amazon Web Services, "Signature Version 4 Signing Process", AWS General Reference, 2024.',
        'Prisma Data Inc., "Prisma ORM Documentation — Version 7", 2026.',
        'Vercel Inc., "Next.js Documentation — App Router", Version 16, 2026.',
        'Oven Technologies, "Bun Runtime Documentation", Version 1.3, 2026.',
        'M. Fowler, "Patterns of Enterprise Application Architecture", Addison-Wesley, 2002.',
        'M. Kleppmann, "Designing Data-Intensive Applications", O\'Reilly Media, 2017.',
    ]:
        r.reference(ref)
    r.section_break('ch_body')

    # ---------------- appendices ----------------
    r.chapter('پیوست‌ها', numbered=False)
    r.section_break('ch_title')

    r.para('پیوست الف — شمارشی‌های مدل داده', S_TITLE2)
    r.para('شمارشی‌های تعریف‌شده در اسکیمای پایگاه داده و معنای هر مقدار:')
    r.table(
        'شمارشی‌های مدل داده',
        ['شمارشی', 'مقادیر', 'معنا'],
        [
            ['GlobalRole', 'STUDENT, PROFESSOR, ADMIN', 'نقش سراسری فرد در دانشگاه'],
            ['AccountStatus', 'PENDING, APPROVED, REJECTED', 'وضعیت بررسی ثبت‌نام'],
            ['ChatType', 'DIRECT, GROUP', 'نوع گفت‌وگو'],
            ['ChatRole', 'ADMIN, MEMBER', 'نقش فرد درون یک گفت‌وگوی مشخص'],
            ['ReceiptStatus', 'DELIVERED, READ', 'وضعیت رسید، که تنها پیش می‌رود'],
            ['SystemEvent', 'MEMBER_ADDED, MEMBER_REMOVED', 'رویداد سامانه‌ای ثبت‌شده در رونوشت گفت‌وگو'],
        ],
        widths=[2.4, 4.0, 4.1])

    r.para('پیوست ب — سقف‌ها و فهرست انواع مجاز فایل', S_TITLE2)
    r.table(
        'سقف‌های اعتبارسنجی ورودی',
        ['مورد', 'مقدار'],
        [
            ['طول شمارهٔ دانشجویی', '۳ تا ۱۶ نویسه'],
            ['طول شمارهٔ تلفن', 'دقیقاً ۱۱ رقم'],
            ['طول گذرواژه', '۸ تا ۱۲۸ نویسه'],
            ['طول نام', '۳ تا ۶۴ نویسه'],
            ['طول شناسهٔ دستگاه', '۱۶ تا ۱۲۸ نویسه'],
            ['طول عنوان گفت‌وگو', '۲ تا ۱۰۰ نویسه'],
            ['طول متن پیام', '۱ تا ۴۰۰۰ نویسه'],
            ['اندازهٔ صفحه', 'پیش‌فرض ۵۰، حداکثر ۱۰۰'],
            ['حداقل طول عبارت جست‌وجو', '۲ نویسه'],
            ['حجم هر فایل پیوست', 'حداکثر ۱۰ مگابایت'],
            ['تعداد پیوست هر پیام', 'حداکثر ۵ فایل'],
            ['حجم آواتار', 'حداکثر ۲ مگابایت'],
        ],
        widths=[5.0, 5.5])
    r.para(
        'سیزده نوع MIME مجاز است: تصاویر PNG، JPEG، GIF و WebP؛ سند PDF؛ متن ساده؛ '
        'بایگانی ZIP؛ و اسناد Office در هر دو قالب قدیمی و جدید واژه‌پرداز، صفحه‌گسترده و '
        'ارائه. آواتار تنها PNG، JPEG یا WebP را می‌پذیرد.')

    r.para('پیوست پ — سرویس‌های استقرار عملیاتی', S_TITLE2)
    r.table(
        'سرویس‌های پشتهٔ عملیاتی و نقش هر یک',
        ['سرویس', 'تصویر', 'نقش'],
        [
            ['nginx', 'nginx:1.29-alpine', 'تنها سرویس منتشرشده؛ خاتمهٔ TLS، محدودیت نرخ و ارتقای WebSocket'],
            ['api', 'تصویر ساخته‌شده', 'واسط برنامه‌نویسی و دروازهٔ بی‌درنگ'],
            ['web', 'تصویر ساخته‌شده', 'واسط کاربری'],
            ['db', 'postgres:18-alpine', 'پایگاه داده'],
            ['migrate', 'تصویر واسط برنامه‌نویسی', 'یک‌بار اجرا می‌شود و باید موفق خاتمه یابد'],
            ['metabase-init', 'postgres:18-alpine', 'ساخت نقش فقط‌خواندنی و اعمال مجوزهای ستونی'],
            ['metabase', 'metabase:v0.63.13', 'گزارش‌گیری، روی دامنه و گواهی مستقل خود'],
            ['certbot', 'certbot/certbot', 'تمدید گواهی هر دوازده ساعت'],
        ],
        widths=[2.0, 2.8, 5.7])
    r.section_break('ch_body')

    # ---------------- english abstract ----------------
    r.para('Abstract:', S_BODY)
    r.blank()
    r.para(
        'Academic correspondence between faculty and students now runs largely on general-purpose '
        'messengers. The silence surrounding where that data is held, and which rules govern access '
        'to it, is itself an unwritten security decision. This project designs and implements a '
        'messaging platform built so that it can run entirely inside a university network, and so '
        'that it identifies people by the same credentials the university has already issued.',
        S_EN_BODY)
    r.para(
        'The method was iterative software engineering with verifiable milestones: each step ended '
        'at a state that could be tested before the next began. The system is a single monorepo '
        'comprising a Next.js web client, a Hono API on the Bun runtime, a PostgreSQL database and '
        'a Socket.IO realtime gateway. Three decisions shape the whole design. Every access rule '
        'lives in exactly one file as a pure function of plain data, and is evaluated both in the '
        'browser and on the server. Every session is bound to one device, so a login from anywhere '
        'else invalidates the previous one immediately. And no single defensive layer is load-bearing: '
        'ten independent layers are applied to every request.',
        S_EN_BODY)
    r.para(
        'The result supports direct and group conversations, read-only announcement channels, file '
        'attachments, delivery and read receipts, reactions, pinning, threaded replies that survive '
        'the deletion of their parent, full-text search, and an administrative queue for approving '
        'registrations. The interface is entirely Persian and right-to-left. Behaviour is verified '
        'by 109 end-to-end tests across 12 spec files in a real browser, run automatically on every '
        'pull request alongside linting and type checking. Production deployment is a single command '
        'behind nginx with real certificates, and the analytics role is structurally incapable of '
        'reading message bodies.',
        S_EN_BODY)
    r.blank()
    r.para('Keywords:', S_BODY)
    r.para('Intranet messaging platform, role-based access control, device-bound sessions, '
           'defence in depth, realtime communication', S_EN_BODY)
    r.page_break()

    # ---------------- english cover ----------------
    r.blank(S_EN_COVER)
    r.para('Qom University of Technology', S_EN_COVER)
    r.para('Faculty of Computer Engineering and Information Technology', S_EN_COVER)
    r.blank(S_EN_COVER, 2)
    r.para(EN_TITLE, S_EN_TITLE)
    r.blank(S_EN_COVER)
    r.para('A Project Submitted in Partial Fulfillment of the Requirements for the Degree of '
           'Bachelor of Science in Computer Engineering', S_EN_COVER)
    r.blank(S_EN_COVER, 2)
    r.para('By:', S_EN_COVER)
    r.para(EN_STUDENT, S_EN_COVER)
    r.blank(S_EN_COVER, 2)
    r.para('Supervisor:', S_EN_COVER)
    r.para(EN_SUPERVISOR, S_EN_COVER)
    r.blank(S_EN_COVER, 2)
    r.para('September 2026', S_EN_DATE)
