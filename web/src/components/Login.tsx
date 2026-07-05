import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, UserPlus, Sparkles, Check, X, ShieldCheck, ChevronDown } from "lucide-react";
import { api } from "../lib/api";
import { loadCaptchaConfig, getCaptchaScriptUrl } from "../lib/captcha-config";
import { useT } from "../lib/i18n";
import { apiFetch } from "../lib/utils";
import { COUNTRY_CODES, detectCountryCodeByTimezone } from "../lib/country-codes";
import { LegalModal } from "./LegalModal";

interface LoginProps {
  onLogin: (token: string) => void;
}

type AuthMode = "login" | "register" | "forgot";
type ForgotMethod = "email" | "phone";

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: "weak", color: "text-danger" };
  if (score <= 4) return { score, label: "medium", color: "text-yellow-500" };
  return { score, label: "strong", color: "text-green-500" };
}

type RegisterMethod = "username" | "email" | "phone";

export function Login({ onLogin }: LoginProps) {
  const t = useT();
  const [mode, setMode] = useState<AuthMode>("login");
  const [registerMethod, setRegisterMethod] = useState<RegisterMethod>("username");
  const [forgotMethod, setForgotMethod] = useState<ForgotMethod>("email");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<null | "terms" | "privacy">(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>("+86");
  const [phoneCountryOpen, setPhoneCountryOpen] = useState(false);
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bannedMessage, setBannedMessage] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [requireInviteCode, setRequireInviteCode] = useState(false);
  const [emailRegEnabled, setEmailRegEnabled] = useState(false);
  const [phoneRegEnabled, setPhoneRegEnabled] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoCompanyName, setSsoCompanyName] = useState("");
  const [ssoIconUrl, setSsoIconUrl] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordBlurred, setPasswordBlurred] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const capRef = useRef<Element | null>(null);

  // 二次密码相关状态
  const [needSecondPassword, setNeedSecondPassword] = useState(false);
  const [secondPassword, setSecondPassword] = useState("");
  const [secondPasswordHint, setSecondPasswordHint] = useState("");
  const [secondPasswordToken, setSecondPasswordToken] = useState<string | null>(null);
  const [secondPasswordLoading, setSecondPasswordLoading] = useState(false);
  const [secondPasswordError, setSecondPasswordError] = useState<string | null>(null);

  // 验证码配置
  const [captchaConfig, setCaptchaConfig] = useState<{
    enabled: boolean;
    provider: string;
    frontendUrl: string;
  } | null>(null);

  // 获取验证码配置并动态加载脚本
  useEffect(() => {
    loadCaptchaConfig().then((config) => {
      setCaptchaConfig(config);
      // 动态加载 captcha 脚本
      if (config.enabled && config.provider === "cap-pow") {
        const scriptUrl = getCaptchaScriptUrl();
        if (!document.querySelector(`script[src="${scriptUrl}"]`)) {
          const script = document.createElement("script");
          script.src = scriptUrl;
          document.head.appendChild(script);
        }
      }
    });
  }, []);

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const passwordMeetsLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordValid = passwordMeetsLength && hasUpperCase && hasLowerCase && hasNumber;
  const showConfirmPassword = (isRegister || isForgot) && passwordBlurred && password.length > 0;
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  // 倒计时
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const timer = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [codeCountdown]);

  // 根据浏览器时区推断默认国家代码
  useEffect(() => {
    setPhoneCountryCode(detectCountryCodeByTimezone());
  }, []);

  // SSO 回调：从 query 中提取 sso_token 并完成登录
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ssoToken = params.get("sso_token");
      const ssoError = params.get("sso_error");
      if (ssoToken) {
        // 清理 URL 防止 token 出现在历史记录中
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
        onLogin(ssoToken);
        return;
      }
      if (ssoError) {
        const clean = window.location.pathname;
        window.history.replaceState({}, "", clean);
        setError(decodeURIComponent(ssoError));
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for cap-widget solve event
  useEffect(() => {
    const widget = document.querySelector("cap-widget");
    if (!widget) return;
    capRef.current = widget;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ token?: string }>).detail;
      if (detail?.token) setCaptchaToken(detail.token);
    };
    widget.addEventListener("solve", handler);
    return () => widget.removeEventListener("solve", handler);
  }, []);

  // Fetch system settings (maintenance mode, invite code requirement, registration channels)
  useEffect(() => {
    apiFetch("/api/system/settings")
      .then((r) => r.json())
      .then((data) => {
        setMaintenanceMode(data.maintenanceMode === true);
        setRequireInviteCode(data.requireInviteCode === true);
        setEmailRegEnabled(data.emailRegistrationEnabled === true);
        setPhoneRegEnabled(data.phoneRegistrationEnabled === true);
        setSsoEnabled(data.ssoEnabled === true);
        setSsoCompanyName(data.ssoCompanyName || "");
        setSsoIconUrl(data.ssoIconUrl || "");
      })
      .catch(() => {});
  }, []);

  // 当管理员开启/关闭注册渠道时，自动回退到 username
  useEffect(() => {
    if (!isRegister) return;
    if (registerMethod === "email" && !emailRegEnabled) setRegisterMethod("username");
    if (registerMethod === "phone" && !phoneRegEnabled) setRegisterMethod("username");
  }, [isRegister, emailRegEnabled, phoneRegEnabled, registerMethod]);

  useEffect(() => {
    if (!isForgot) return;
    if (forgotMethod === "email" && !emailRegEnabled && phoneRegEnabled) setForgotMethod("phone");
    if (forgotMethod === "phone" && !phoneRegEnabled && emailRegEnabled) setForgotMethod("email");
  }, [isForgot, emailRegEnabled, phoneRegEnabled, forgotMethod]);

  async function handleSendCode(purpose: "register" | "reset_password" = "register") {
    setError(null);
    const method = purpose === "reset_password" ? forgotMethod : registerMethod;
    if (method === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError(t("server.invalidEmail"));
        return;
      }
    } else if (method === "phone") {
      if (!phone.trim()) {
        setError(t("server.invalidPhone"));
        return;
      }
    }
    if (captchaConfig?.enabled !== false && captchaConfig?.provider !== "none") {
      if (!captchaToken) {
        setError(t("error.captchaRequired"));
        return;
      }
    }
    setSendingCode(true);
    try {
      const target = method === "email"
        ? email.trim()
        : `${phoneCountryCode}${phone.trim().replace(/^\+/, "")}`;
      await api.sendVerificationCode({
        target,
        type: method as "email" | "phone",
        purpose,
        captchaToken: captchaToken ?? undefined,
      });
      setCodeCountdown(60);
    } catch (err: any) {
      setError(err?.message || t("server.codeSendFailed"));
    } finally {
      setSendingCode(false);
    }
  }

  function resetForm(next: AuthMode) {
    setMode(next);
    setError(null);
    setSuccessMessage(null);
    setPassword("");
    setConfirmPassword("");
    setPasswordFocused(false);
    setPasswordBlurred(false);
    setEmail("");
    setPhone("");
    setCode("");
    setCodeCountdown(0);
    setAgreeTerms(false);
    resetCaptcha();
    if (next === "login") {
      setDisplayName("");
      setForgotMethod("email");
    }
    if (next === "register") setRegisterMethod("username");
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (isForgot) {
      if (forgotMethod === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError(t("server.invalidEmail"));
        return;
      }
      if (forgotMethod === "phone" && !phone.trim()) {
        setError(t("server.invalidPhone"));
        return;
      }
      if (!code.trim() || code.trim().length !== 6) {
        setError(t("server.codeInvalid"));
        return;
      }
      if (!passwordValid) {
        setError(t("server.passwordRequirements"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("profile.passwordMismatch"));
        return;
      }
      if (captchaConfig?.enabled !== false && captchaConfig?.provider !== "none" && !captchaToken) {
        setError(t("error.captchaRequired"));
        return;
      }
      setLoading(true);
      try {
        const target = forgotMethod === "email"
          ? email.trim()
          : `${phoneCountryCode}${phone.trim().replace(/^\+/, "")}`;
        await api.resetPassword({
          target,
          type: forgotMethod,
          code: code.trim(),
          newPassword: password,
          captchaToken: captchaToken ?? undefined,
        });
        resetForm("login");
        setSuccessMessage(t("login.resetPasswordSuccess"));
      } catch (err: any) {
        setError(err?.message || t("login.verifyFailed"));
        resetCaptcha();
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError(t("server.enterUsernamePassword"));
      return;
    }
    if (!agreeTerms) {
      setError(t("login.mustAgreeTerms"));
      return;
    }
    if (isRegister) {
      if (!displayName.trim()) {
        setError(t("profile.nicknamePlaceholder"));
        return;
      }
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(username.trim())) {
        setError(t("login.usernameInvalid"));
        return;
      }
      if (registerMethod === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
          setError(t("server.invalidEmail"));
          return;
        }
        if (!code.trim() || code.trim().length !== 6) {
          setError(t("server.emailCodeError"));
          return;
        }
      } else if (registerMethod === "phone") {
        if (!phone.trim()) {
          setError(t("server.invalidPhone"));
          return;
        }
        if (!code.trim() || code.trim().length !== 6) {
          setError(t("server.phoneCodeError"));
          return;
        }
      }
      if (inviteCode.trim() && inviteCode.trim().length < 4) {
        setError(t("server.inviteCodeError"));
        return;
      }
      if (requireInviteCode && !inviteCode.trim()) {
        setError(t("login.inviteCode"));
        return;
      }
      if (!passwordValid) {
        setError(t("server.passwordRequirements"));
        return;
      }
      if (!confirmPassword) {
        setError(t("login.confirmPassword"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("profile.passwordMismatch"));
        return;
      }
    }

    if (captchaConfig?.enabled !== false && captchaConfig?.provider !== 'none') {
      if (!captchaToken) {
        setError(t("error.captchaRequired"));
        return;
      }
    }

    setLoading(true);
    try {
      const result = isRegister
        ? await api.register({
            type: registerMethod,
            username: username.trim(),
            password,
            displayName: displayName.trim(),
            email: registerMethod === "email" ? email.trim() : undefined,
            phone: registerMethod === "phone" ? `${phoneCountryCode}${phone.trim().replace(/^\+/, "")}` : undefined,
            code: registerMethod !== "username" ? code.trim() : undefined,
            captchaToken: captchaToken ?? undefined,
            inviteCode: inviteCode.trim() || undefined,
          })
        : await api.login({ username: username.trim(), password, captchaToken: captchaToken ?? undefined });

      // 检查是否需要二次密码
      if (result.needSecondPassword) {
        setNeedSecondPassword(true);
        setSecondPasswordHint(result.secondPasswordHint || "");
        setSecondPasswordToken(result.token);
      } else {
        onLogin(result.token);
      }
    } catch (err: any) {
      const msg = err?.message || (isRegister ? t("login.registerFailed") : t("login.loginFailed"));
      if (msg.includes(t("adminSettings.maintenance")) || msg.includes("maintenance") || msg.includes("503")) {
        setMaintenanceMode(true);
        setError(t("error.maintenance"));
      } else if (msg.includes(t("admin.banUser"))) {
        setBannedMessage(msg);
      } else {
        setError(msg);
      }
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySecondPassword() {
    if (!secondPassword.trim()) {
      setSecondPasswordError(t("login.enterSecondPassword"));
      return;
    }
    
    setSecondPasswordLoading(true);
    setSecondPasswordError(null);
    
    try {
      const result = await api.verifySecondPassword(secondPasswordToken!, secondPassword);
      onLogin(result.user.id ? secondPasswordToken! : "");
    } catch (err: any) {
      setSecondPasswordError(err?.message || t("login.authFailed"));
    } finally {
      setSecondPasswordLoading(false);
    }
  }

  function resetCaptcha() {
    setCaptchaToken(null);
    const widget = capRef.current || document.querySelector("cap-widget");
    if (widget) (widget as any).reset?.();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-app text-ink-primary">
      <div className="aurora-bg hidden lg:block" />
      <div className="grain hidden lg:block" />

      <motion.div
        className="pointer-events-none absolute -right-40 -top-40 hidden h-[640px] w-[640px] rounded-full opacity-60 blur-3xl lg:block"
        style={{
          background:
            "radial-gradient(closest-side, rgba(142,235,255,0.55), rgba(47,125,255,0.3) 60%, transparent 80%)",
        }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <header className="flex items-center gap-3">
            <NavoMark className="h-10 w-10" />
            <div>
              <div className="font-display text-2xl font-semibold tracking-tight">Navo IM</div>
              <div className="-mt-0.5 text-xs uppercase tracking-[0.2em] text-ink-muted">
                next-gen messaging
              </div>
            </div>
          </header>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-xl"
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line-light/70 bg-surface/60 px-3 py-1 text-xs text-ink-secondary backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-ocean" />
              {t("login.version")} {new Date().toLocaleDateString("zh-CN")}
            </div>
            <h1 className="font-display text-[64px] font-light leading-[0.98] tracking-tight text-balance" dangerouslySetInnerHTML={{ __html: t("app.tagline") }} />
            <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-ink-secondary">
              {t("app.description")}
            </p>

            <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
              <Stat value="< 30ms" label={t("login.stats.msgLatency")} />
              <Stat value="∞" label={t("login.stats.horizontalScale")} />
              <Stat value="100%" label={t("login.stats.persistent")} />
            </div>
          </motion.div>

          <footer className="text-xs text-ink-muted">
            © {new Date().getFullYear()} Navo · Crafted with care.
          </footer>
        </div>

        <div className="flex min-h-screen flex-col items-stretch lg:items-center lg:justify-center lg:p-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full flex-1 flex-col lg:max-w-md lg:flex-none lg:my-auto"
          >
            <div className="glass-panel relative flex w-full flex-1 flex-col justify-center overflow-hidden p-5 lg:rounded-3xl lg:p-8 lg:shadow-soft lg:flex-none lg:justify-start">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-gradient opacity-30 blur-3xl" />
              <div className="lg:hidden mb-6 flex items-center gap-3">
                <NavoMark className="h-9 w-9" />
                <div className="font-display text-xl font-semibold">Navo IM</div>
              </div>

              <AnimatePresence mode="wait">
                {bannedMessage ? (
                  <motion.div
                    key="banned"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-10"
                  >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
                      <svg className="h-8 w-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                    </div>
                    <h3 className="font-display text-xl font-semibold text-ink-primary mb-2">{t("login.bannedTitle")}</h3>
                    <p className="text-sm text-ink-secondary max-w-xs mx-auto mb-4">
                      {bannedMessage}
                    </p>
                    <button
                      onClick={() => setBannedMessage(null)}
                      className="rounded-xl bg-surface-soft border border-line-light/70 px-6 py-2 text-sm font-medium text-ink-secondary hover:bg-line-light/50 transition-colors"
                    >
                      {t("login.returnToLogin")}
                    </button>
                  </motion.div>
                ) : maintenanceMode ? (
                  <motion.div
                    key="maintenance"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-10"
                  >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-yellow-500/10">
                      <svg className="h-8 w-8 text-yellow-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </div>
                    <h3 className="font-display text-xl font-semibold text-ink-primary mb-2">{t("login.maintenance")}</h3>
                    <p className="text-sm text-ink-secondary max-w-xs mx-auto">
                      {t("error.maintenance")}
                    </p>
                  </motion.div>
                ) : needSecondPassword ? (
                  <motion.div
                    key="second-password"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-6"
                  >
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient/10">
                      <ShieldCheck className="h-8 w-8 text-ocean" />
                    </div>
                    <h3 className="font-display text-xl font-semibold text-ink-primary mb-2">{t("login.secondPassword")}</h3>
                    {secondPasswordHint && (
                      <p className="text-sm text-ink-secondary max-w-xs mx-auto mb-4 italic">
                        {t("profile.secondPasswordHint")} {secondPasswordHint}
                      </p>
                    )}
                    <div className="space-y-4 mt-6">
                      <input
                        className="input-base"
                        type="password"
                        value={secondPassword}
                        onChange={(e) => setSecondPassword(e.target.value)}
                        placeholder={t("login.enterSecondPassword")}
                        autoFocus
                      />
                      {secondPasswordError && (
                        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                          {secondPasswordError}
                        </div>
                      )}
                      <button
                        onClick={handleVerifySecondPassword}
                        disabled={secondPasswordLoading}
                        className="btn-primary w-full"
                      >
                        {secondPasswordLoading ? t("common.loading") : t("common.confirm")}
                      </button>
                      <button
                        onClick={() => {
                          setNeedSecondPassword(false);
                          setSecondPassword("");
                          setSecondPasswordHint("");
                          setSecondPasswordToken(null);
                          setSecondPasswordError(null);
                        }}
                        className="text-sm text-ink-secondary hover:text-ink-primary transition-colors"
                      >
                        {t("login.returnToLogin")}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="login-form"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h2 className="font-display text-2xl font-semibold tracking-tight">
                          {isForgot ? t("login.resetPassword") : isRegister ? t("login.title") : t("login.subtitle")}
                        </h2>
                        <p className="mt-1 text-sm text-ink-secondary">
                          {isForgot ? t("login.forgotPassword") : t("login.startChat")}
                        </p>
                      </div>
                    </div>

                    <form onSubmit={submit} className="space-y-4">
                      {isForgot && (emailRegEnabled || phoneRegEnabled) && (
                        <div className="flex gap-1 rounded-xl border border-line-light/70 bg-surface-soft p-1">
                          {emailRegEnabled && (
                            <button
                              type="button"
                              onClick={() => setForgotMethod("email")}
                              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                forgotMethod === "email"
                                  ? "bg-surface text-ocean shadow-sm"
                                  : "text-ink-secondary hover:text-ink-primary"
                              }`}
                            >
                              {t("login.resetMethodEmail")}
                            </button>
                          )}
                          {phoneRegEnabled && (
                            <button
                              type="button"
                              onClick={() => setForgotMethod("phone")}
                              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                forgotMethod === "phone"
                                  ? "bg-surface text-ocean shadow-sm"
                                  : "text-ink-secondary hover:text-ink-primary"
                              }`}
                            >
                              {t("login.resetMethodPhone")}
                            </button>
                          )}
                        </div>
                      )}

                      {isRegister && (emailRegEnabled || phoneRegEnabled) && (
                        <div className="flex gap-1 rounded-xl border border-line-light/70 bg-surface-soft p-1">
                          <button
                            type="button"
                            onClick={() => setRegisterMethod("username")}
                            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              registerMethod === "username"
                                ? "bg-surface text-ocean shadow-sm"
                                : "text-ink-secondary hover:text-ink-primary"
                            }`}
                          >
                            {t("login.methodUsername")}
                          </button>
                          {emailRegEnabled && (
                            <button
                              type="button"
                              onClick={() => setRegisterMethod("email")}
                              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                registerMethod === "email"
                                  ? "bg-surface text-ocean shadow-sm"
                                  : "text-ink-secondary hover:text-ink-primary"
                              }`}
                            >
                              {t("login.methodEmail")}
                            </button>
                          )}
                          {phoneRegEnabled && (
                            <button
                              type="button"
                              onClick={() => setRegisterMethod("phone")}
                              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                                registerMethod === "phone"
                                  ? "bg-surface text-ocean shadow-sm"
                                  : "text-ink-secondary hover:text-ink-primary"
                              }`}
                            >
                              {t("login.methodPhone")}
                            </button>
                          )}
                        </div>
                      )}

                      {!isForgot && (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                          {t("login.username")}
                        </span>
                        <input
                          className="input-base"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          autoComplete="username"
                          placeholder={t("login.username")}
                        />
                      </label>
                      )}

                      {isForgot && forgotMethod === "email" && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.email")}
                          </span>
                          <input
                            className="input-base"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            placeholder={t("login.emailPlaceholder")}
                          />
                        </label>
                      )}

                      {isForgot && forgotMethod === "phone" && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.phone")}
                          </span>
                          <div className="flex gap-2">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setPhoneCountryOpen(!phoneCountryOpen)}
                                onBlur={() => setTimeout(() => setPhoneCountryOpen(false), 150)}
                                className="flex h-full items-center gap-1.5 rounded-xl border border-line-light/70 bg-surface px-2.5 text-sm hover:bg-surface-soft"
                              >
                                <span className="text-lg leading-none">{COUNTRY_CODES.find((c) => c.code === phoneCountryCode)?.flag || "🌐"}</span>
                                <span className="font-mono text-xs">{phoneCountryCode}</span>
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              </button>
                              {phoneCountryOpen && (
                                <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-line-light/70 bg-surface shadow-soft">
                                  {COUNTRY_CODES.map((c) => (
                                    <button
                                      key={c.code + c.name}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => { setPhoneCountryCode(c.code); setPhoneCountryOpen(false); }}
                                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-line-light/50 ${
                                        c.code === phoneCountryCode ? "bg-ocean/10 text-ocean" : ""
                                      }`}
                                    >
                                      <span className="text-base leading-none">{c.flag}</span>
                                      <span className="flex-1 truncate">{c.name}</span>
                                      <span className="font-mono text-[10px] text-ink-muted">{c.code}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              className="input-base flex-1"
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              autoComplete="tel"
                              placeholder={t("login.phonePlaceholder")}
                            />
                          </div>
                        </label>
                      )}

                      {isForgot && (
                        <div className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.verificationCode")}
                          </span>
                          <div className="flex gap-2">
                            <input
                              className="input-base flex-1"
                              inputMode="numeric"
                              maxLength={6}
                              value={code}
                              onChange={(e) => setCode(e.target.value)}
                              placeholder={t("login.codePlaceholder")}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSendCode("reset_password")}
                              disabled={sendingCode || codeCountdown > 0 || (forgotMethod === "email" ? !email.trim() : !phone.trim())}
                              className="shrink-0 rounded-xl border border-line-light/70 bg-surface px-3 text-xs font-medium text-ocean transition-colors hover:bg-ocean/10 disabled:opacity-50"
                            >
                              {codeCountdown > 0
                                ? t("login.resendCode", { seconds: codeCountdown })
                                : t("login.sendCode")}
                            </button>
                          </div>
                        </div>
                      )}

                      {isRegister && registerMethod === "email" && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.email")}
                          </span>
                          <input
                            className="input-base"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            placeholder={t("login.emailPlaceholder")}
                          />
                        </label>
                      )}

                      {isRegister && registerMethod === "email" && (
                        <div className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.code")}
                          </span>
                          <div className="flex gap-2">
                            <input
                              className="input-base flex-1"
                              inputMode="numeric"
                              maxLength={6}
                              value={code}
                              onChange={(e) => setCode(e.target.value)}
                              placeholder={t("login.codePlaceholder")}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSendCode("register")}
                              disabled={sendingCode || codeCountdown > 0 || !email.trim()}
                              className="shrink-0 rounded-xl border border-line-light/70 bg-surface px-3 text-xs font-medium text-ocean transition-colors hover:bg-ocean/10 disabled:opacity-50"
                            >
                              {codeCountdown > 0
                                ? t("login.resendCode", { seconds: codeCountdown })
                                : t("login.sendCode")}
                            </button>
                          </div>
                        </div>
                      )}

                      {isRegister && registerMethod === "phone" && (
                        <label className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.phone")}
                          </span>
                          <div className="flex gap-2">
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setPhoneCountryOpen(!phoneCountryOpen)}
                                onBlur={() => setTimeout(() => setPhoneCountryOpen(false), 150)}
                                className="flex h-full items-center gap-1.5 rounded-xl border border-line-light/70 bg-surface px-2.5 text-sm hover:bg-surface-soft"
                              >
                                <span className="text-lg leading-none">{COUNTRY_CODES.find((c) => c.code === phoneCountryCode)?.flag || "🌐"}</span>
                                <span className="font-mono text-xs">{phoneCountryCode}</span>
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              </button>
                              {phoneCountryOpen && (
                                <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-xl border border-line-light/70 bg-surface shadow-soft">
                                  {COUNTRY_CODES.map((c) => (
                                    <button
                                      key={c.code + c.name}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => { setPhoneCountryCode(c.code); setPhoneCountryOpen(false); }}
                                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-line-light/50 ${
                                        c.code === phoneCountryCode ? "bg-ocean/10 text-ocean" : ""
                                      }`}
                                    >
                                      <span className="text-base leading-none">{c.flag}</span>
                                      <span className="flex-1 truncate">{c.name}</span>
                                      <span className="font-mono text-[10px] text-ink-muted">{c.code}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              className="input-base flex-1"
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              autoComplete="tel"
                              placeholder={t("login.phonePlaceholder")}
                            />
                          </div>
                        </label>
                      )}

                      {isRegister && registerMethod === "phone" && (
                        <div className="block">
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                            {t("login.code")}
                          </span>
                          <div className="flex gap-2">
                            <input
                              className="input-base flex-1"
                              inputMode="numeric"
                              maxLength={6}
                              value={code}
                              onChange={(e) => setCode(e.target.value)}
                              placeholder={t("login.codePlaceholder")}
                            />
                            <button
                              type="button"
                              onClick={() => void handleSendCode("register")}
                              disabled={sendingCode || codeCountdown > 0 || !phone.trim()}
                              className="shrink-0 rounded-xl border border-line-light/70 bg-surface px-3 text-xs font-medium text-ocean transition-colors hover:bg-ocean/10 disabled:opacity-50"
                            >
                              {codeCountdown > 0
                                ? t("login.resendCode", { seconds: codeCountdown })
                                : t("login.sendCode")}
                            </button>
                          </div>
                        </div>
                      )}

                      <AnimatePresence initial={false}>
                        {isRegister && (
                          <motion.label
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="block overflow-hidden"
                          >
                            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                              {t("login.displayName")}
                            </span>
                            <input
                              className="input-base"
                              value={displayName}
                              onChange={(e) => setDisplayName(e.target.value)}
                              placeholder={t("profile.nicknamePlaceholder")}
                            />
                          </motion.label>
                        )}
                      </AnimatePresence>

                      <AnimatePresence initial={false}>
                        {isRegister && requireInviteCode && (
                          <motion.label
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="block overflow-hidden"
                          >
                            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                              {t("login.inviteCode")}
                            </span>
                            <input
                              className="input-base"
                              value={inviteCode}
                              onChange={(e) => setInviteCode(e.target.value)}
                              placeholder={t("login.inviteCode")}
                            />
                          </motion.label>
                        )}
                      </AnimatePresence>

                      <div className="block">
                        <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                          {isForgot ? t("login.newPassword") : t("login.password")}
                        </span>
                        <input
                          className="input-base"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onFocus={() => setPasswordFocused(true)}
                          onBlur={() => {
                            setPasswordFocused(false);
                            setPasswordBlurred(true);
                          }}
                          autoComplete={isRegister || isForgot ? "new-password" : "current-password"}
                          placeholder="••••••••"
                        />
                        {!isForgot && mode === "login" && (
                          <button
                            type="button"
                            onClick={() => resetForm("forgot")}
                            className="mt-1.5 text-xs text-ocean hover:underline"
                          >
                            {t("login.forgotPassword")}
                          </button>
                        )}
                        <AnimatePresence>
                          {(isRegister || isForgot) && passwordFocused && password.length > 0 && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-ink-muted">{t("login.passwordStrength")}</span>
                                  <span className={`text-xs font-medium ${strength.color}`}>{t(`login.passwordStrength.${strength.label}` as any)}</span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(strength.score / 6) * 100}%` }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                    className={`h-full rounded-full ${
                                      strength.score <= 2 ? "bg-danger" : strength.score <= 4 ? "bg-yellow-500" : "bg-green-500"
                                    }`}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-1 pt-1">
                                  <Requirement met={passwordMeetsLength} label={t("login.passwordRequirement.length")} />
                                  <Requirement met={hasUpperCase} label={t("login.passwordRequirement.uppercase")} />
                                  <Requirement met={hasLowerCase} label={t("login.passwordRequirement.lowercase")} />
                                  <Requirement met={hasNumber} label={t("login.passwordRequirement.number")} />
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <AnimatePresence initial={false}>
                        {showConfirmPassword && (
                          <motion.label
                            initial={{ opacity: 0, height: 0, scaleY: 0.8 }}
                            animate={{ opacity: 1, height: "auto", scaleY: 1 }}
                            exit={{ opacity: 0, height: 0, scaleY: 0.8 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="block overflow-hidden origin-top"
                          >
                            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                              {t("login.confirmPassword")}
                            </span>
                            <input
                              className="input-base"
                              type="password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              autoComplete="new-password"
                              placeholder="••••••••"
                              autoFocus
                            />
                            {confirmPassword.length > 0 && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-1.5"
                              >
                                {password === confirmPassword ? (
                                  <span className="text-xs text-green-500 flex items-center gap-1">
                                    <Check className="h-3 w-3" /> {t("profile.passwordMatch")}
                                  </span>
                                ) : (
                                  <span className="text-xs text-danger flex items-center gap-1">
                                    <X className="h-3 w-3" /> {t("profile.passwordMismatch")}
                                  </span>
                                )}
                              </motion.div>
                            )}
                          </motion.label>
                        )}
                      </AnimatePresence>

                      {!isForgot && (
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-secondary">
                          <input
                            type="checkbox"
                            checked={agreeTerms}
                            onChange={(e) => setAgreeTerms(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-line-light text-ocean focus:ring-ocean"
                          />
                          <span>
                            {t("login.agreeTerms")}{" "}
                            <button type="button" onClick={() => setLegalModal("terms")} className="text-ocean hover:underline">
                              {t("login.termsOfService")}
                            </button>
                            {" / "}
                            <button type="button" onClick={() => setLegalModal("privacy")} className="text-ocean hover:underline">
                              {t("login.privacyPolicy")}
                            </button>
                          </span>
                        </label>
                      )}

                      {successMessage && (
                        <div className="rounded-xl border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-700">
                          {successMessage}
                        </div>
                      )}

                      {error && (
                        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                          {error}
                        </div>
                      )}

                      {captchaConfig?.enabled !== false && captchaConfig?.provider !== 'none' && (
                        <div className="flex flex-col items-center gap-2 pt-1">
                          <div className="flex items-center gap-2 text-xs text-ink-muted">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>{t("login.captcha")} · {captchaConfig?.provider === 'cloudflare' ? 'CloudFlare' : 'Cap-Pow'}</span>
                          </div>
                          {captchaConfig?.provider === 'cloudflare' ? (
                            <div className="text-xs text-ink-muted">CloudFlare Turnstile</div>
                          ) : (
                            <cap-widget
                              id="cap"
                              data-cap-api-endpoint={`${captchaConfig?.frontendUrl || ""}/api/`}
                            />
                          )}
                        </div>
                      )}

                      <button type="submit" disabled={loading} className="btn-primary w-full">
                        {isForgot ? null : isRegister ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                        {loading
                          ? (isForgot ? t("common.saving") : isRegister ? t("login.registering") : t("login.loggingIn"))
                          : (isForgot ? t("login.resetPassword") : isRegister ? t("login.register") : t("login.login"))}
                      </button>
                    </form>

                    {ssoEnabled && !isForgot && (
                      <div className="mt-5 space-y-2">
                        <div className="flex items-center gap-3 text-xs text-ink-muted">
                          <div className="h-px flex-1 bg-line-light/70" />
                          <span>其他登录方式</span>
                          <div className="h-px flex-1 bg-line-light/70" />
                        </div>
                        <button
                          type="button"
                          disabled={ssoLoading}
                          onClick={async () => {
                            setError(null);
                            setSsoLoading(true);
                            try {
                              const { authorizationUrl } = await api.ssoInitiate();
                              // 跳转到 IdP 授权页，回调由后端 /api/auth/sso/callback 处理并 302 回 /login?sso_token=...
                              window.location.href = authorizationUrl;
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "SSO 登录失败");
                              setSsoLoading(false);
                            }
                          }}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line-light/70 bg-surface px-4 py-2.5 text-sm font-medium text-ink-primary transition-colors hover:bg-surface-soft disabled:opacity-50"
                        >
                          {ssoIconUrl ? (
                            <img
                              src={ssoIconUrl}
                              alt=""
                              className="h-5 w-5 rounded object-contain"
                            />
                          ) : (
                            <LogIn className="h-4 w-4 text-ocean" />
                          )}
                          {ssoLoading ? t("common.loading") : t("login.ssoButton", { company: ssoCompanyName || "SSO" })}
                        </button>
                      </div>
                    )}

                    <div className="mt-6 text-center text-sm text-ink-secondary">
                      {isForgot ? (
                        <>
                          <button
                            type="button"
                            onClick={() => resetForm("login")}
                            className="font-medium text-ocean hover:underline"
                          >
                            {t("login.backToLogin")}
                          </button>
                        </>
                      ) : (
                        <>
                          {isRegister ? t("login.hasAccount") : t("login.noAccount")}
                          <button
                            type="button"
                            onClick={() => resetForm(isRegister ? "login" : "register")}
                            className="ml-1 font-medium text-ocean hover:underline"
                          >
                            {isRegister ? t("login.directLogin") : t("login.quickRegister")}
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </div>
      {legalModal && <LegalModal kind={legalModal} onClose={() => setLegalModal(null)} />}
    </div>
  );
}

function Requirement({ met, label }: { met: boolean; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-1.5"
    >
      {met ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <X className="h-3 w-3 text-ink-muted" />
      )}
      <span className={`text-[11px] ${met ? "text-green-500" : "text-ink-muted"}`}>{label}</span>
    </motion.div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line-light/70 bg-surface/60 p-4 backdrop-blur">
      <div className="font-display text-2xl font-semibold tracking-tight text-gradient-brand">
        {value}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-ink-muted">{label}</div>
    </div>
  );
}

function NavoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="login-nm-g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#66B8FF" />
          <stop offset="0.5" stopColor="#2F7DFF" />
          <stop offset="1" stopColor="#8A6CFF" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#login-nm-g)" />
      <path
        d="M16 46V18l16 18V18l16 18v10"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className="text-white max-md:text-ink-primary"
      />
    </svg>
  );
}
