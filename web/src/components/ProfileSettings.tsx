import { useRef, useState, useEffect } from "react";
import { Camera, Check, KeyRound, Lock, LogOut, X, Volume2, VolumeX, ShieldCheck, Globe } from "lucide-react";
import { useChatStore } from "../lib/store";
import { api } from "../lib/api";
import { wsClient } from "../lib/ws-client";
import { Avatar } from "./Avatar";
import { StatusPicker } from "./StatusPicker";
import { cn, apiFetch } from "../lib/utils";
import { notificationSound } from "../lib/sound";
import { loadCaptchaScript } from "../lib/captcha-config";
import type { Gender, Language } from "@navo/shared";
import { LANGUAGES } from "@navo/shared";
import { useT } from "../lib/i18n";

const AVATAR_COLORS = ["#66B8FF", "#2F7DFF", "#8A6CFF", "#8EEBFF", "#FFB84D", "#FF5C7A", "#35C789", "#4DA3FF"];

export function ProfileSettings({ onClose }: { onClose: () => void }) {
  const me = useChatStore((s) => s.me);
  const upsertUser = useChatStore((s) => s.upsertUser);
  const reset = useChatStore((s) => s.reset);
  const t = useT();

  const GENDERS: { value: Gender; label: string; emoji: string }[] = [
    { value: "unspecified", label: t("user.gender.unspecified"), emoji: "" },
    { value: "male", label: t("user.gender.male"), emoji: "" },
    { value: "female", label: t("user.gender.female"), emoji: "" },
    { value: "other", label: t("user.gender.other"), emoji: "" },
  ];

  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [bio, setBio] = useState(me?.bio ?? "");
  const [gender, setGender] = useState<Gender>(me?.gender ?? "unspecified");
  const [avatarUrl, setAvatarUrl] = useState(me?.avatarUrl ?? "");
  const [avatarColor, setAvatarColor] = useState(me?.avatarColor ?? AVATAR_COLORS[0]);
  const [requireApproval, setRequireApproval] = useState(me?.requireFriendApproval ?? true);
  const [status, setStatus] = useState(me?.status ?? "online");
  const [language, setLang] = useState<Language>((me?.language as Language) || useChatStore.getState().language);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pwdOpen, setPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSavedFlash, setPwdSavedFlash] = useState(false);
  const [pwdCaptcha, setPwdCaptcha] = useState<string | null>(null);

  // Account deletion state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePwd, setDeletePwd] = useState("");
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteCaptcha, setDeleteCaptcha] = useState<string | null>(null);
  const [captchaConfig, setCaptchaConfig] = useState<{ enabled: boolean; provider: string; frontendUrl: string } | null>(null);

  // 邮箱/手机号绑定状态
  const [emailRegEnabled, setEmailRegEnabled] = useState(false);
  const [phoneRegEnabled, setPhoneRegEnabled] = useState(false);
  const [contactEditing, setContactEditing] = useState<null | "email" | "phone">(null);
  const [contactNewValue, setContactNewValue] = useState("");
  const [contactCode, setContactCode] = useState("");
  const [contactPassword, setContactPassword] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactCountdown, setContactCountdown] = useState(0);
  const [contactCaptcha, setContactCaptcha] = useState<string | null>(null);
  const [unbindConfirm, setUnbindConfirm] = useState<null | "email" | "phone">(null);
  const [unbindPwd, setUnbindPwd] = useState("");

  // Second password state
  const [secondPwdOpen, setSecondPwdOpen] = useState(false);
  const [secondPwdHas, setSecondPwdHas] = useState(false);
  const [secondPwdHint, setSecondPwdHint] = useState("");
  const [newSecondPwd, setNewSecondPwd] = useState("");
  const [newSecondHint, setNewSecondHint] = useState("");
  const [secondPwdSaving, setSecondPwdSaving] = useState(false);
  const [secondPwdError, setSecondPwdError] = useState<string | null>(null);
  const [secondPwdFlash, setSecondPwdFlash] = useState(false);
  const [secondPwdRemoveConfirm, setSecondPwdRemoveConfirm] = useState(false);
  const [secondPwdCaptcha, setSecondPwdCaptcha] = useState<string | null>(null);

  // Listen for delete-account captcha widget
  useEffect(() => {
    if (!deleteOpen) return;
    const waitForWidget = setInterval(() => {
      const widget = document.querySelector("cap-widget#cap-delete");
      if (!widget) return;
      clearInterval(waitForWidget);
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ token?: string }>).detail;
        if (detail?.token) setDeleteCaptcha(detail.token);
      };
      widget.addEventListener("solve", handler);
      return () => widget.removeEventListener("solve", handler);
    }, 200);
    return () => clearInterval(waitForWidget);
  }, [deleteOpen]);

  // Listen for password-change captcha widget
  useEffect(() => {
    if (!pwdOpen) return;
    const waitForWidget = setInterval(() => {
      const widget = document.querySelector("cap-widget#cap-pwd");
      if (!widget) return;
      clearInterval(waitForWidget);
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ token?: string }>).detail;
        if (detail?.token) setPwdCaptcha(detail.token);
      };
      widget.addEventListener("solve", handler);
      return () => widget.removeEventListener("solve", handler);
    }, 200);
    return () => clearInterval(waitForWidget);
  }, [pwdOpen]);

  // Listen for contact bind/change captcha widget
  useEffect(() => {
    if (!contactEditing) return;
    if (!captchaConfig?.enabled || captchaConfig?.provider === "none") return;
    const waitForWidget = setInterval(() => {
      const widget = document.querySelector("cap-widget#cap-contact");
      if (!widget) return;
      clearInterval(waitForWidget);
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ token?: string }>).detail;
        if (detail?.token) setContactCaptcha(detail.token);
      };
      widget.addEventListener("solve", handler);
      return () => widget.removeEventListener("solve", handler);
    }, 200);
    return () => clearInterval(waitForWidget);
  }, [contactEditing, captchaConfig]);

  // 拉取系统设置：邮箱/手机号渠道开关
  useEffect(() => {
    apiFetch("/api/system/settings")
      .then((r) => r.json())
      .then((data) => {
        setEmailRegEnabled(data.emailRegistrationEnabled === true);
        setPhoneRegEnabled(data.phoneRegistrationEnabled === true);
      })
      .catch(() => {});
  }, []);

  // 验证码倒计时
  useEffect(() => {
    if (contactCountdown <= 0) return;
    const timer = setTimeout(() => setContactCountdown(contactCountdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [contactCountdown]);

  // 联系渠道变更处理
  async function sendContactCode() {
    if (!contactNewValue.trim()) {
      setContactError(t("server.registrationIncomplete"));
      return;
    }
    // 人机验证：开启后必须先完成
    if (captchaConfig?.enabled && captchaConfig?.provider !== "none" && !contactCaptcha) {
      setContactError(t("error.captchaRequired"));
      return;
    }
    setContactError(null);
    setContactSending(true);
    try {
      await api.sendVerificationCode({
        target: contactNewValue.trim(),
        type: contactEditing!,
        purpose: me && (me as any)[contactEditing!] ? (contactEditing === "email" ? "change_email" : "change_phone") : (contactEditing === "email" ? "bind_email" : "bind_phone"),
        captchaToken: contactCaptcha ?? undefined,
      });
      setContactCountdown(60);
    } catch (e: any) {
      setContactError(e?.message || t("server.codeSendFailed"));
    } finally {
      setContactSending(false);
    }
  }

  async function saveContact() {
    setContactError(null);
    const isAlreadyBound = contactEditing === "email" ? !!me?.email : contactEditing === "phone" ? !!me?.phone : false;
    if (!contactNewValue.trim() || !contactCode.trim()) {
      setContactError(t("server.registrationIncomplete"));
      return;
    }
    if (isAlreadyBound && !contactPassword) {
      setContactError(t("server.enterPassword"));
      return;
    }
    setContactSaving(true);
    try {
      const result = contactEditing === "email"
        ? (isAlreadyBound
          ? await api.changeEmail({ newEmail: contactNewValue.trim(), code: contactCode.trim(), password: contactPassword })
          : await api.bindEmail({ email: contactNewValue.trim(), code: contactCode.trim() }))
        : (isAlreadyBound
          ? await api.changePhone({ newPhone: contactNewValue.trim(), code: contactCode.trim(), password: contactPassword })
          : await api.bindPhone({ phone: contactNewValue.trim(), code: contactCode.trim() }));
      upsertUser(result.user);
      setContactEditing(null);
      setContactNewValue("");
      setContactCode("");
      setContactPassword("");
    } catch (e: any) {
      setContactError(e?.message || t("profile.contactSaveFailed"));
    } finally {
      setContactSaving(false);
    }
  }

  async function doUnbind() {
    if (!unbindPwd) {
      setContactError(t("server.enterPassword"));
      return;
    }
    setContactSaving(true);
    setContactError(null);
    try {
      const result = unbindConfirm === "email"
        ? await api.unbindEmail({ password: unbindPwd })
        : await api.unbindPhone({ password: unbindPwd });
      upsertUser(result.user);
      setUnbindConfirm(null);
      setUnbindPwd("");
    } catch (e: any) {
      setContactError(e?.message || t("profile.contactSaveFailed"));
    } finally {
      setContactSaving(false);
    }
  }

  // Listen for second-password captcha widget
  useEffect(() => {
    if (!secondPwdOpen) return;
    const waitForWidget = setInterval(() => {
      const widget = document.querySelector("cap-widget#cap-second");
      if (!widget) return;
      clearInterval(waitForWidget);
      const handler = (e: Event) => {
        const detail = (e as CustomEvent<{ token?: string }>).detail;
        if (detail?.token) setSecondPwdCaptcha(detail.token);
      };
      widget.addEventListener("solve", handler);
      return () => widget.removeEventListener("solve", handler);
    }, 200);
    return () => clearInterval(waitForWidget);
  }, [secondPwdOpen]);

  // Fetch second password status
  useEffect(() => {
    api.getSecondPasswordStatus()
      .then((data) => {
        setSecondPwdHas(data.has);
        setSecondPwdHint(data.hint || "");
      })
      .catch(() => {});
  }, []);

  // Fetch captcha config and load script
  useEffect(() => {
    apiFetch("/api/system/captcha-config")
      .then((r) => r.json())
      .then((data) => {
        const config = {
          enabled: data.enabled ?? false,
          provider: data.provider ?? "cap-pow",
          frontendUrl: data.frontendUrl || "",
        };
        setCaptchaConfig(config);
        // Dynamically load captcha script
        if (config.enabled && config.provider === "cap-pow") {
          loadCaptchaScript(config.frontendUrl);
        }
      })
      .catch(() => {});
  }, []);

  const [soundEnabled, setSoundEnabled] = useState(notificationSound.isEnabled());

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    notificationSound.setEnabled(next);
    if (next) notificationSound.play();
  }

  if (!me) return null;
  const { id: meId } = me;

  const preview = { ...me, displayName, bio, gender, avatarUrl, avatarColor, status };

  function handleStatusChange(next: typeof status) {
    setStatus(next);
    useChatStore.getState().setPresence(meId, next, new Date().toISOString());
    wsClient.send({ type: "presence:set", status: next });
  }

  async function pickAvatar(file: File) {
    setError(null);
    setUploading(true);
    try {
      const att = await api.upload(file);
      setAvatarUrl(att.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("error.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateProfile({
        displayName: displayName.trim() || me!.displayName,
        bio,
        gender,
        avatarUrl,
        avatarColor,
        requireFriendApproval: requireApproval,
        language,
      });
      upsertUser(updated);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setSaving(false);
    }
  }

  const captchaEnabled = captchaConfig?.enabled && captchaConfig?.provider !== 'none';

  async function changePassword() {
    setPwdError(null);
    if (!currentPwd || !newPwd) {
      setPwdError(t("server.enterCurrentNewPassword"));
      return;
    }
    if (newPwd.length < 6) {
      setPwdError(t("profile.passwordPlaceholder"));
      return;
    }
    if (newPwd !== newPwd2) {
      setPwdError(t("profile.passwordMismatch"));
      return;
    }
    if (captchaEnabled && !pwdCaptcha) {
      setPwdError(t("error.captchaRequired"));
      return;
    }
    setPwdSaving(true);
    try {
      await api.changePassword({ currentPassword: currentPwd, newPassword: newPwd, captchaToken: pwdCaptcha ?? undefined });
      setCurrentPwd("");
      setNewPwd("");
      setNewPwd2("");
      setPwdCaptcha(null);
      setPwdSavedFlash(true);
      setTimeout(() => {
        setPwdSavedFlash(false);
        setPwdOpen(false);
      }, 1500);
    } catch (e) {
      setPwdError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setPwdSaving(false);
    }
  }

  async function deleteAccount() {
    setDeleteError(null);
    if (!deletePwd) {
      setDeleteError(t("server.enterPassword"));
      return;
    }
    if (captchaEnabled && !deleteCaptcha) {
      setDeleteError(t("error.captchaRequired"));
      return;
    }
    setDeleteSaving(true);
    try {
      await api.deleteAccount({ password: deletePwd, captchaToken: deleteCaptcha ?? undefined });
      reset();
      window.location.reload();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setDeleteSaving(false);
    }
  }

  async function saveSecondPassword() {
    setSecondPwdError(null);
    if (!newSecondPwd) {
      setSecondPwdError(t("server.enterSecondPassword"));
      return;
    }
    if (newSecondPwd.length < 4) {
      setSecondPwdError(t("profile.secondPasswordPlaceholder"));
      return;
    }
    if (!newSecondHint) {
      setSecondPwdError(t("server.enterHint"));
      return;
    }
    if (captchaEnabled && !secondPwdCaptcha) {
      setSecondPwdError(t("error.captchaRequired"));
      return;
    }
    setSecondPwdSaving(true);
    try {
      await api.setSecondPassword({ password: newSecondPwd, hint: newSecondHint, captchaToken: secondPwdCaptcha ?? undefined });
      setSecondPwdHas(true);
      setSecondPwdHint(newSecondHint);
      setNewSecondPwd("");
      setNewSecondHint("");
      setSecondPwdCaptcha(null);
      setSecondPwdFlash(true);
      setTimeout(() => setSecondPwdFlash(false), 1800);
    } catch (e) {
      setSecondPwdError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setSecondPwdSaving(false);
    }
  }

  async function removeSecondPassword() {
    if (captchaEnabled && !secondPwdCaptcha) {
      setSecondPwdError(t("error.captchaRequired"));
      return;
    }
    setSecondPwdSaving(true);
    try {
      await api.removeSecondPassword(secondPwdCaptcha ?? undefined);
      setSecondPwdHas(false);
      setSecondPwdHint("");
      setSecondPwdRemoveConfirm(false);
      setSecondPwdCaptcha(null);
    } catch (e) {
      setSecondPwdError(e instanceof Error ? e.message : t("common.unknown"));
    } finally {
      setSecondPwdSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app">
      <header className="flex items-center justify-between border-b border-line-light/70 bg-surface/60 px-6 py-4 backdrop-blur-xl shrink-0">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted">settings</div>
          <h1 className="font-display text-xl font-semibold tracking-tight">{t("profile.title")}</h1>
        </div>
        <button onClick={onClose} className="btn-ghost" title={t("common.close")}>
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 py-8">

        {/* Identity card */}
        <section className="glass-panel mb-6 overflow-hidden rounded-3xl p-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar user={preview} size="xl" />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-brand-gradient text-white shadow-glow"
                title={t("profile.uploadAvatar")}
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void pickAvatar(e.target.files[0])}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl font-semibold tracking-tight">{displayName || me.displayName}</div>
              <div className="text-sm text-ink-muted">@{me.username}</div>
              {uploading && <div className="mt-1 text-xs text-ocean">{t("profile.uploading")}</div>}
            </div>
          </div>

          {avatarUrl && (
            <button
              onClick={() => setAvatarUrl("")}
              className="mt-3 text-xs text-ink-muted hover:text-danger"
            >
              {t("profile.removeAvatar")}
            </button>
          )}

          {!avatarUrl && (
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.avatarColor")}</div>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setAvatarColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full ring-2 transition-transform hover:scale-110",
                      avatarColor === c ? "ring-aqua" : "ring-transparent",
                    )}
                    style={{ background: `linear-gradient(135deg, ${c} 0%, #2F7DFF 100%)` }}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Fields */}
        <section className="glass-panel mb-6 space-y-5 rounded-3xl p-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.nickname")}</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={24}
              className="input-base"
              placeholder={t("profile.nicknamePlaceholder")}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.bio")}</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
              rows={3}
              className="input-base resize-none"
              placeholder={t("profile.bioPlaceholder")}
            />
            <span className="mt-1 block text-right text-[11px] text-ink-muted">{bio.length}/200</span>
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.gender")}</span>
            <div className="flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGender(g.value)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-all",
                    gender === g.value
                      ? "border-aqua bg-aqua/10 text-ink-primary shadow-glow"
                      : "border-line-light bg-surface text-ink-secondary hover:bg-surface-soft",
                  )}
                >
                  <span>{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Organization */}
        {me?.organizationId && (
          <OrgInfoSection orgId={me.organizationId} title={me.orgTitle} />
        )}

        {/* Status */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.status")}</div>
          <div className="mt-3">
            <StatusPicker value={status} onChange={handleStatusChange} />
          </div>
        </section>

        {/* Privacy */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.privacy")}</div>
          <label className="mt-3 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-ink-primary">{t("profile.friendApproval")}</div>
              <div className="text-xs text-ink-muted">{t("profile.friendApprovalDesc")}</div>
            </div>
            <button
              onClick={() => setRequireApproval((v) => !v)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                requireApproval ? "bg-brand-gradient" : "bg-line-light",
              )}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                  requireApproval ? "left-6" : "left-1",
                )}
              />
            </button>
          </label>
        </section>

        {/* Notifications */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.notifications")}</div>
          <label className="mt-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl", soundEnabled ? "bg-brand-soft text-ocean" : "bg-surface-soft text-ink-muted")}>
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </span>
              <div>
                <div className="text-sm font-medium text-ink-primary">{t("profile.sound")}</div>
                <div className="text-xs text-ink-muted">{t("profile.soundDesc")}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleSound}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                soundEnabled ? "bg-brand-gradient" : "bg-line-light",
              )}
              aria-pressed={soundEnabled}
            >
              <span
                className={cn(
                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                  soundEnabled ? "left-6" : "left-1",
                )}
              />
            </button>
          </label>
        </section>

        {/* Language */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
            <Globe className="inline h-3.5 w-3.5 mr-1" />
            {t("profile.language")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                onClick={() => setLang(l.value)}
                className={cn(
                  "rounded-xl border px-4 py-2 text-sm transition-all",
                  language === l.value
                    ? "border-aqua bg-aqua/10 text-ink-primary shadow-glow"
                    : "border-line-light bg-surface text-ink-secondary hover:bg-surface-soft",
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </section>

        {/* Password */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("accountSecurity")}</div>
          {!pwdOpen ? (
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink-primary">{t("profile.password")}</div>
                <div className="text-xs text-ink-muted">{t("profile.passwordDesc")}</div>
              </div>
              <button
                onClick={() => { setPwdError(null); setPwdOpen(true); }}
                className="inline-flex items-center gap-2 rounded-xl border border-line-light bg-surface px-3 py-2 text-sm text-ink-primary transition-colors hover:bg-surface-soft"
              >
                <KeyRound className="h-4 w-4" />
                {t("profile.changePassword")}
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.currentPassword")}</span>
                <input
                  type="password"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  autoComplete="current-password"
                  className="input-base"
                  placeholder="••••••••"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.newPassword")}</span>
                <input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                  className="input-base"
                  placeholder={t("profile.passwordPlaceholder")}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.confirmNewPassword")}</span>
                <input
                  type="password"
                  value={newPwd2}
                  onChange={(e) => setNewPwd2(e.target.value)}
                  autoComplete="new-password"
                  className="input-base"
                  placeholder={t("profile.confirmPasswordPlaceholder")}
                />
              </label>
              {pwdError && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {pwdError}
                </div>
              )}
              {captchaEnabled && (
                <div className="flex flex-col items-center gap-2 pt-1">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{t("profile.captcha")} · {captchaConfig?.provider === 'cloudflare' ? t("profile.cloudflare") : t("profile.aijian")}</span>
                  </div>
                  <cap-widget
                    id="cap-pwd"
                    data-cap-api-endpoint={`${captchaConfig?.frontendUrl || ""}/api/`}
                  />
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setPwdOpen(false); setPwdError(null); setCurrentPwd(""); setNewPwd(""); setNewPwd2(""); }}
                  className="btn-ghost px-4"
                  disabled={pwdSaving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={changePassword}
                  disabled={pwdSaving}
                  className="btn-primary px-5"
                >
                  {pwdSavedFlash ? <Check className="h-4 w-4" /> : null}
                  {pwdSaving ? t("common.saving") : pwdSavedFlash ? t("common.saved") : t("profile.save")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Second Password */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.secondPassword")}</div>
          <div className="mt-1 text-xs text-ink-muted">{t("profile.secondPasswordDesc")}</div>

          {!secondPwdOpen ? (
            <div className="mt-3 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink-primary">
                  {secondPwdHas ? t("profile.secondPasswordEnabled") : t("profile.secondPasswordDisabled")}
                </div>
                {secondPwdHas && secondPwdHint && (
                  <div className="text-xs text-ink-muted">{t("profile.secondPasswordHint")}{secondPwdHint}</div>
                )}
              </div>
              <button
                onClick={() => { setSecondPwdError(null); setSecondPwdOpen(true); setSecondPwdRemoveConfirm(false); }}
                className="inline-flex items-center gap-2 rounded-xl border border-line-light bg-surface px-3 py-2 text-sm text-ink-primary transition-colors hover:bg-surface-soft"
              >
                <Lock className="h-4 w-4" />
                {secondPwdHas ? t("profile.modifySecondPassword") : t("profile.setSecondPassword")}
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {secondPwdHas && !secondPwdRemoveConfirm ? (
                <>
                  <div className="rounded-xl border border-line-light/70 bg-surface-soft px-4 py-3 text-sm text-ink-secondary">
                    {t("profile.secondPasswordEnabled")}，{t("profile.secondPasswordHint")}{secondPwdHint}
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.secondPasswordNew")}</span>
                    <input
                      type="password"
                      value={newSecondPwd}
                      onChange={(e) => setNewSecondPwd(e.target.value)}
                      className="input-base"
                      placeholder={t("profile.hintPlaceholder")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.secondPasswordNewHint")}</span>
                    <input
                      type="text"
                      value={newSecondHint}
                      onChange={(e) => setNewSecondHint(e.target.value)}
                      className="input-base"
                      placeholder={t("profile.hintPlaceholder")}
                    />
                  </label>
                </>
              ) : secondPwdRemoveConfirm ? (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {t("profile.confirmCloseSecondPassword")}
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.secondPassword")}</span>
                    <input
                      type="password"
                      value={newSecondPwd}
                      onChange={(e) => setNewSecondPwd(e.target.value)}
                      className="input-base"
                      placeholder={t("profile.secondPasswordPlaceholder")}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.secondPasswordNewHint")}</span>
                    <input
                      type="text"
                      value={newSecondHint}
                      onChange={(e) => setNewSecondHint(e.target.value)}
                      className="input-base"
                      placeholder={t("profile.hintPlaceholder")}
                    />
                  </label>
                </>
              )}

              {secondPwdError && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {secondPwdError}
                </div>
              )}

              {captchaEnabled && (
                <div className="flex flex-col items-center gap-2 pt-1">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{t("profile.captcha")} · {captchaConfig?.provider === 'cloudflare' ? t("profile.cloudflare") : t("profile.aijian")}</span>
                  </div>
                  <cap-widget
                    id="cap-second"
                    data-cap-api-endpoint={`${captchaConfig?.frontendUrl || ""}/api/`}
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                {secondPwdHas && !secondPwdRemoveConfirm && (
                  <button
                    onClick={() => setSecondPwdRemoveConfirm(true)}
                    className="btn-ghost px-4 text-danger"
                    disabled={secondPwdSaving}
                  >
                    {t("profile.closeSecondPassword")}
                  </button>
                )}
                {secondPwdRemoveConfirm && (
                  <button
                    onClick={removeSecondPassword}
                    className="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                    disabled={secondPwdSaving}
                  >
                    {secondPwdSaving ? t("common.saving") : t("profile.confirmCloseSecondPassword")}
                  </button>
                )}
                <button
                  onClick={() => {
                    setSecondPwdOpen(false);
                    setSecondPwdError(null);
                    setNewSecondPwd("");
                    setNewSecondHint("");
                    setSecondPwdRemoveConfirm(false);
                  }}
                  className="btn-ghost px-4"
                  disabled={secondPwdSaving}
                >
                  {t("common.cancel")}
                </button>
                {!secondPwdRemoveConfirm && (
                  <button
                    onClick={saveSecondPassword}
                    disabled={secondPwdSaving}
                    className="btn-primary px-5"
                  >
                    {secondPwdSaving ? t("common.saving") : secondPwdFlash ? t("common.saved") : t("common.save")}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 邮箱/手机号绑定 */}
        <section className="glass-panel mb-6 rounded-3xl p-6">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.contact")}</div>
          <div className="mt-1 text-xs text-ink-muted">{t("profile.contactDesc")}</div>

          {!emailRegEnabled && !phoneRegEnabled && (
            <div className="mt-3 rounded-xl border border-line-light/70 bg-surface-soft px-3 py-2 text-xs text-ink-muted">
              {t("profile.contactChannelsClosed")}
            </div>
          )}

          {/* 邮箱行 */}
          {emailRegEnabled && (
            <div className="mt-3 rounded-xl border border-line-light/70 bg-surface-soft px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-[0.14em] text-ink-muted">{t("login.email")}</div>
                  <div className="mt-0.5 truncate text-sm text-ink-primary">
                    {me?.email || <span className="text-ink-muted">{t("profile.notBound")}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setContactEditing("email");
                      setContactNewValue(me?.email || "");
                      setContactError(null);
                    }}
                    className="rounded-lg border border-line-light bg-surface px-3 py-1.5 text-xs text-ink-primary hover:bg-line-light/40"
                  >
                    {me?.email ? t("profile.changeContact") : t("profile.bind")}
                  </button>
                  {me?.email && (
                    <button
                      onClick={() => { setUnbindConfirm("email"); setUnbindPwd(""); setContactError(null); }}
                      className="rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
                    >
                      {t("profile.unbind")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 手机号行 */}
          {phoneRegEnabled && (
            <div className="mt-3 rounded-xl border border-line-light/70 bg-surface-soft px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-[0.14em] text-ink-muted">{t("login.phone")}</div>
                  <div className="mt-0.5 truncate text-sm text-ink-primary">
                    {me?.phone || <span className="text-ink-muted">{t("profile.notBound")}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => {
                      setContactEditing("phone");
                      setContactNewValue(me?.phone || "");
                      setContactError(null);
                    }}
                    className="rounded-lg border border-line-light bg-surface px-3 py-1.5 text-xs text-ink-primary hover:bg-line-light/40"
                  >
                    {me?.phone ? t("profile.changeContact") : t("profile.bind")}
                  </button>
                  {me?.phone && (
                    <button
                      onClick={() => { setUnbindConfirm("phone"); setUnbindPwd(""); setContactError(null); }}
                      className="rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs text-danger hover:bg-danger/10"
                    >
                      {t("profile.unbind")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {contactEditing && (
            <div className="mt-3 space-y-3 rounded-xl border border-line-light bg-surface p-4">
              <div className="text-sm font-medium text-ink-primary">
                {me && (me as any)[contactEditing]
                  ? t(`profile.change${contactEditing === "email" ? "Email" : "Phone"}`)
                  : t(`profile.bind${contactEditing === "email" ? "Email" : "Phone"}`)}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">
                  {contactEditing === "email" ? t("login.newEmail") : t("login.newPhone")}
                </span>
                <input
                  type={contactEditing === "email" ? "email" : "tel"}
                  value={contactNewValue}
                  onChange={(e) => setContactNewValue(e.target.value)}
                  className="input-base"
                  placeholder={contactEditing === "email" ? t("login.emailPlaceholder") : t("login.phonePlaceholder")}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("login.code")}</span>
                <div className="flex gap-2">
                  <input
                    className="input-base flex-1"
                    inputMode="numeric"
                    maxLength={6}
                    value={contactCode}
                    onChange={(e) => setContactCode(e.target.value)}
                    placeholder={t("login.codePlaceholder")}
                  />
                  <button
                    type="button"
                    onClick={sendContactCode}
                    disabled={contactSending || contactCountdown > 0 || !contactNewValue.trim()}
                    className="shrink-0 rounded-xl border border-line-light/70 bg-surface px-3 text-xs font-medium text-ocean transition-colors hover:bg-ocean/10 disabled:opacity-50"
                  >
                    {contactCountdown > 0 ? t("login.resendCode", { seconds: contactCountdown }) : t("login.sendCode")}
                  </button>
                </div>
              </label>
              {me && (me as any)[contactEditing] && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.currentPassword")}</span>
                  <input
                    type="password"
                    value={contactPassword}
                    onChange={(e) => setContactPassword(e.target.value)}
                    className="input-base"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </label>
              )}
              {captchaConfig?.enabled && captchaConfig?.provider !== "none" && (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-ink-muted">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{t("profile.captcha")} · {captchaConfig?.provider === "cloudflare" ? t("profile.cloudflare") : t("profile.aijian")}</span>
                  </div>
                  {captchaConfig?.provider === "cloudflare" ? (
                    <div className="text-xs text-ink-muted">CloudFlare Turnstile</div>
                  ) : (
                    <cap-widget
                      id="cap-contact"
                      data-cap-api-endpoint={`${captchaConfig?.frontendUrl || ""}/api/`}
                    />
                  )}
                </div>
              )}
              {contactError && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {contactError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setContactEditing(null); setContactNewValue(""); setContactCode(""); setContactPassword(""); setContactError(null); setContactCaptcha(null); }}
                  className="btn-ghost px-4"
                  disabled={contactSaving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={saveContact}
                  disabled={contactSaving}
                  className="btn-primary px-5"
                >
                  {contactSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
          )}

          {unbindConfirm && (
            <div className="mt-3 space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="text-sm font-medium text-danger">
                {t(`profile.confirmUnbind${unbindConfirm === "email" ? "Email" : "Phone"}`)}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.currentPassword")}</span>
                <input
                  type="password"
                  value={unbindPwd}
                  onChange={(e) => setUnbindPwd(e.target.value)}
                  className="input-base"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </label>
              {contactError && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {contactError}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setUnbindConfirm(null); setUnbindPwd(""); setContactError(null); }}
                  className="btn-ghost px-4"
                  disabled={contactSaving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={doUnbind}
                  disabled={contactSaving}
                  className="rounded-xl border border-danger/40 bg-danger px-5 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50"
                >
                  {contactSaving ? t("common.saving") : t("profile.unbind")}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Account deletion */}
        <section className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-danger/10">
              <svg className="h-5 w-5 text-danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm font-semibold text-danger">{t("profile.deleteAccount")}</div>
              <div className="text-xs text-ink-muted">{t("profile.deleteAccountDesc")}</div>
            </div>
          </div>

          {!deleteOpen ? (
            <div className="mt-3">
              <button
                onClick={() => { setDeleteError(null); setDeleteOpen(true); setDeleteCaptcha(null); }}
                className="inline-flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger transition-colors hover:bg-danger/10"
              >
                {t("profile.deleteAccount")}
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger leading-relaxed">
                <div className="font-semibold mb-2">{t("profile.deleteAccountWarning")}</div>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {t("profile.deleteWarningItems").split("\n").map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.deleteConfirmPassword")}</span>
                <input
                  type="password"
                  value={deletePwd}
                  onChange={(e) => setDeletePwd(e.target.value)}
                  autoComplete="current-password"
                  className="input-base"
                  placeholder={t("profile.deletePasswordPlaceholder")}
                />
              </label>

              {deleteError && (
                <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {deleteError}
                </div>
              )}

              <div className="flex flex-col items-center gap-2 pt-1">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>{t("profile.captcha")} · {captchaConfig?.provider === 'cloudflare' ? t("profile.cloudflare") : captchaConfig?.provider === 'cap-pow' ? t("profile.aijian") : t("captcha.title")}</span>
                </div>
                {captchaConfig?.enabled !== false && captchaConfig?.provider !== 'none' && (
                  <cap-widget
                    id="cap-delete"
                    data-cap-api-endpoint={`${captchaConfig?.frontendUrl || ""}/api/`}
                  />
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setDeleteOpen(false); setDeleteError(null); setDeletePwd(""); setDeleteCaptcha(null); }}
                  className="btn-ghost px-4"
                  disabled={deleteSaving}
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={deleteAccount}
                  disabled={deleteSaving}
                  className="rounded-lg bg-danger px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                >
                  {deleteSaving ? t("profile.deleting") : t("profile.confirmDelete")}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="mb-6 rounded-2xl border border-line-light/70 bg-surface-soft/50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-ink-primary">{t("profile.aboutUs")}</h3>
          <p className="text-sm leading-relaxed text-ink-secondary whitespace-pre-wrap">{t("profile.aboutUsContent")}</p>
        </section>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              reset();
              window.location.reload();
            }}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <LogOut className="h-4 w-4" />
            {t("profile.logout")}
          </button>

          <button onClick={save} disabled={saving || uploading} className="btn-primary px-6">
            {savedFlash ? <Check className="h-4 w-4" /> : null}
            {saving ? t("common.saving") : savedFlash ? t("common.saved") : t("profile.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrgInfoSection({ orgId, title }: { orgId: string; title?: string }) {
    const t = useT();
  const [path, setPath] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin.getOrgPath(orgId).then(setPath).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  return (
    <section className="glass-panel mb-6 rounded-3xl p-6">
      <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-secondary">{t("profile.organization")}</div>
      <div className="mt-3 flex items-center gap-2 text-sm text-ink-primary">
        {loading ? (
          <span className="text-ink-muted">{t("common.loading")}</span>
        ) : path.length > 0 ? (
          <span>{path.map((o) => o.name).join(" > ")}</span>
        ) : (
          <span className="text-ink-muted">{t("common.unknown")}</span>
        )}
        {title && <span className="text-ink-muted">· {title}</span>}
      </div>
    </section>
  );
}
