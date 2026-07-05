// 常用国家/地区手机号区号（含国旗 emoji）
// 字段：国家中文名、国际区号、国旗 emoji

export interface CountryCode {
  name: string;
  nameEn: string;
  code: string; // 形如 +86
  flag: string; // 国旗 emoji
}

export const COUNTRY_CODES: CountryCode[] = [
  { name: "中国大陆", nameEn: "China", code: "+86", flag: "🇨🇳" },
  { name: "中国香港", nameEn: "Hong Kong", code: "+852", flag: "🇭🇰" },
  { name: "中国澳门", nameEn: "Macao", code: "+853", flag: "🇲🇴" },
  { name: "中国台湾", nameEn: "Taiwan", code: "+886", flag: "🇹🇼" },
  { name: "美国", nameEn: "United States", code: "+1", flag: "🇺🇸" },
  { name: "加拿大", nameEn: "Canada", code: "+1", flag: "🇨🇦" },
  { name: "英国", nameEn: "United Kingdom", code: "+44", flag: "🇬🇧" },
  { name: "日本", nameEn: "Japan", code: "+81", flag: "🇯🇵" },
  { name: "韩国", nameEn: "Korea", code: "+82", flag: "🇰🇷" },
  { name: "新加坡", nameEn: "Singapore", code: "+65", flag: "🇸🇬" },
  { name: "马来西亚", nameEn: "Malaysia", code: "+60", flag: "🇲🇾" },
  { name: "泰国", nameEn: "Thailand", code: "+66", flag: "🇹🇭" },
  { name: "越南", nameEn: "Vietnam", code: "+84", flag: "🇻🇳" },
  { name: "印度", nameEn: "India", code: "+91", flag: "🇮🇳" },
  { name: "印度尼西亚", nameEn: "Indonesia", code: "+62", flag: "🇮🇩" },
  { name: "菲律宾", nameEn: "Philippines", code: "+63", flag: "🇵🇭" },
  { name: "澳大利亚", nameEn: "Australia", code: "+61", flag: "🇦🇺" },
  { name: "新西兰", nameEn: "New Zealand", code: "+64", flag: "🇳🇿" },
  { name: "德国", nameEn: "Germany", code: "+49", flag: "🇩🇪" },
  { name: "法国", nameEn: "France", code: "+33", flag: "🇫🇷" },
  { name: "意大利", nameEn: "Italy", code: "+39", flag: "🇮🇹" },
  { name: "西班牙", nameEn: "Spain", code: "+34", flag: "🇪🇸" },
  { name: "葡萄牙", nameEn: "Portugal", code: "+351", flag: "🇵🇹" },
  { name: "荷兰", nameEn: "Netherlands", code: "+31", flag: "🇳🇱" },
  { name: "比利时", nameEn: "Belgium", code: "+32", flag: "🇧🇪" },
  { name: "瑞士", nameEn: "Switzerland", code: "+41", flag: "🇨🇭" },
  { name: "奥地利", nameEn: "Austria", code: "+43", flag: "🇦🇹" },
  { name: "瑞典", nameEn: "Sweden", code: "+46", flag: "🇸🇪" },
  { name: "挪威", nameEn: "Norway", code: "+47", flag: "🇳🇴" },
  { name: "丹麦", nameEn: "Denmark", code: "+45", flag: "🇩🇰" },
  { name: "芬兰", nameEn: "Finland", code: "+358", flag: "🇫🇮" },
  { name: "波兰", nameEn: "Poland", code: "+48", flag: "🇵🇱" },
  { name: "俄罗斯", nameEn: "Russia", code: "+7", flag: "🇷🇺" },
  { name: "乌克兰", nameEn: "Ukraine", code: "+380", flag: "🇺🇦" },
  { name: "土耳其", nameEn: "Turkey", code: "+90", flag: "🇹🇷" },
  { name: "以色列", nameEn: "Israel", code: "+972", flag: "🇮🇱" },
  { name: "阿联酋", nameEn: "UAE", code: "+971", flag: "🇦🇪" },
  { name: "沙特阿拉伯", nameEn: "Saudi Arabia", code: "+966", flag: "🇸🇦" },
  { name: "巴西", nameEn: "Brazil", code: "+55", flag: "🇧🇷" },
  { name: "墨西哥", nameEn: "Mexico", code: "+52", flag: "🇲🇽" },
  { name: "阿根廷", nameEn: "Argentina", code: "+54", flag: "🇦🇷" },
  { name: "智利", nameEn: "Chile", code: "+56", flag: "🇨🇱" },
  { name: "南非", nameEn: "South Africa", code: "+27", flag: "🇿🇦" },
  { name: "埃及", nameEn: "Egypt", code: "+20", flag: "🇪🇬" },
  { name: "尼日利亚", nameEn: "Nigeria", code: "+234", flag: "🇳🇬" },
  { name: "肯尼亚", nameEn: "Kenya", code: "+254", flag: "🇰🇪" },
];

// 时区 → 国家代码（粗略映射，主要用于默认选中国家）
const TIMEZONE_TO_CODE: Record<string, string> = {
  "Asia/Shanghai": "+86",
  "Asia/Hong_Kong": "+852",
  "Asia/Macau": "+853",
  "Asia/Taipei": "+886",
  "Asia/Tokyo": "+81",
  "Asia/Seoul": "+82",
  "Asia/Singapore": "+65",
  "Asia/Kuala_Lumpur": "+60",
  "Asia/Bangkok": "+66",
  "Asia/Ho_Chi_Minh": "+84",
  "Asia/Jakarta": "+62",
  "Asia/Manila": "+63",
  "Asia/Kolkata": "+91",
  "Asia/Calcutta": "+91",
  "Australia/Sydney": "+61",
  "Australia/Melbourne": "+61",
  "Pacific/Auckland": "+64",
  "America/New_York": "+1",
  "America/Chicago": "+1",
  "America/Los_Angeles": "+1",
  "America/Toronto": "+1",
  "America/Vancouver": "+1",
  "America/Mexico_City": "+52",
  "America/Sao_Paulo": "+55",
  "America/Argentina/Buenos_Aires": "+54",
  "America/Santiago": "+56",
  "Europe/London": "+44",
  "Europe/Berlin": "+49",
  "Europe/Paris": "+33",
  "Europe/Rome": "+39",
  "Europe/Madrid": "+34",
  "Europe/Lisbon": "+351",
  "Europe/Amsterdam": "+31",
  "Europe/Brussels": "+32",
  "Europe/Zurich": "+41",
  "Europe/Vienna": "+43",
  "Europe/Stockholm": "+46",
  "Europe/Oslo": "+47",
  "Europe/Copenhagen": "+45",
  "Europe/Helsinki": "+358",
  "Europe/Warsaw": "+48",
  "Europe/Moscow": "+7",
  "Europe/Kiev": "+380",
  "Europe/Istanbul": "+90",
  "Asia/Jerusalem": "+972",
  "Asia/Dubai": "+971",
  "Asia/Riyadh": "+966",
  "Africa/Johannesburg": "+27",
  "Africa/Cairo": "+20",
  "Africa/Lagos": "+234",
  "Africa/Nairobi": "+254",
};

export function detectCountryCodeByTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz && TIMEZONE_TO_CODE[tz]) return TIMEZONE_TO_CODE[tz];
    // 模糊匹配：前缀
    for (const key of Object.keys(TIMEZONE_TO_CODE)) {
      if (key.startsWith(tz) || tz.startsWith(key)) return TIMEZONE_TO_CODE[key];
    }
  } catch {
    // ignore
  }
  return "+86";
}

export function detectCountryCodeByLocale(): string {
  try {
    const locale = (navigator.language || "").toLowerCase();
    if (locale.includes("zh-cn") || locale.includes("zh-hans")) return "+86";
    if (locale.includes("zh-hk")) return "+852";
    if (locale.includes("zh-mo")) return "+853";
    if (locale.includes("zh-tw")) return "+886";
    if (locale.includes("en-us")) return "+1";
    if (locale.includes("en-gb")) return "+44";
    if (locale.includes("ja")) return "+81";
    if (locale.includes("ko")) return "+82";
    if (locale.includes("ru")) return "+7";
  } catch {
    // ignore
  }
  return "+86";
}
