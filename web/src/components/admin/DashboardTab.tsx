import { useState, useEffect } from "react";
import {
  Users,
  Activity,
  Hash,
  MessageCircle,
  TrendingUp,
  RefreshCw,
  Database,
  Radar,
  Cpu,
  BarChart3,
  ShieldCheck,
  Zap,
  Globe2,
  Server,
  Radio,
  Wifi,
  Sparkles,
  Layers3,
  Gauge,
  CircleDot,
} from "lucide-react";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { cn } from "../../lib/utils";
import type { AdminDashboardStats } from "@navo/shared";

const MetricCard = ({
  icon,
  label,
  value,
  sub,
  gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  gradient: string;
}) => (
  <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/85 p-4 shadow-[0_10px_30px_rgba(59,130,246,0.16)] backdrop-blur-xl">
    <div className={cn("absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl", gradient)} />

    <div className="relative flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-2 font-mono text-2xl font-bold text-slate-900 md:text-3xl">
          {value.toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-slate-400">{sub}</p>
      </div>

      <div className={cn("rounded-2xl bg-gradient-to-br p-3 text-white shadow-lg", gradient)}>
        {icon}
      </div>
    </div>
  </div>
);

export function DashboardTab() {
  const t = useT();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.admin
      .getDashboard()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <RefreshCw className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!stats) {
    return <div className="py-12 text-center text-slate-500">{t("adminSettings.loadFailed")}</div>;
  }

  const chartData = [
    { label: t("admin.totalUsers"), value: stats.totalUsers, icon: Users, color: "from-sky-400 to-blue-500" },
    { label: t("admin.activeUsers"), value: stats.activeUsers, icon: Activity, color: "from-emerald-400 to-teal-500" },
    { label: t("admin.channels"), value: stats.totalChannels, icon: Hash, color: "from-violet-400 to-purple-500" },
    { label: t("admin.messages"), value: stats.totalMessages, icon: MessageCircle, color: "from-orange-400 to-rose-500" },
    { label: t("admin.newToday"), value: stats.newUsersToday, icon: TrendingUp, color: "from-cyan-400 to-sky-500" },
    { label: t("admin.newThisWeek"), value: stats.newUsersThisWeek, icon: Sparkles, color: "from-blue-400 to-indigo-500" },
    { label: t("admin.messagesToday"), value: stats.messagesToday, icon: Radio, color: "from-pink-400 to-fuchsia-500" },
    { label: t("admin.messagesThisWeek"), value: stats.messagesThisWeek, icon: Layers3, color: "from-purple-400 to-pink-500" },
  ];

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  return (
    <div className="space-y-5 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-1">
      {/* Top Light Tech Banner */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white bg-gradient-to-r from-sky-100 via-cyan-50 to-indigo-100 p-5 shadow-[0_20px_60px_rgba(14,165,233,0.18)] md:p-6">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.14)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-300/40 blur-3xl" />
        <div className="absolute -bottom-20 left-10 h-52 w-52 rounded-full bg-indigo-300/40 blur-3xl" />

        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {[Radar, Cpu, Database, Wifi, ShieldCheck].map((Icon, i) => (
                <span
                  key={i}
                  className="rounded-2xl border border-white/80 bg-white/70 p-2 text-sky-500 shadow-sm"
                >
                  <Icon className="h-4 w-4" />
                </span>
              ))}
            </div>

            <h2 className="font-display text-2xl font-bold text-slate-900 md:text-3xl">
              {t("admin.title")}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {t("admin.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Server, label: "SERVER", value: "ON" },
              { icon: Globe2, label: "NETWORK", value: "LIVE" },
              { icon: Zap, label: "SYNC", value: "FAST" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-3xl border border-white/80 bg-white/70 p-3 text-center shadow-sm backdrop-blur"
              >
                <item.icon className="mx-auto mb-1 h-5 w-5 text-sky-500" />
                <div className="text-[10px] text-slate-400">{item.label}</div>
                <div className="text-xs font-bold text-slate-800">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Icon Metric Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard icon={<Users className="h-5 w-5" />} label={t("admin.totalUsers")} value={stats.totalUsers} sub={t("admin.totalUsers")} gradient="from-sky-400 to-blue-500" />
        <MetricCard icon={<Activity className="h-5 w-5" />} label={t("admin.activeUsers")} value={stats.activeUsers} sub={t("admin.activeUsers")} gradient="from-emerald-400 to-teal-500" />
        <MetricCard icon={<Hash className="h-5 w-5" />} label={t("admin.channels")} value={stats.totalChannels} sub={t("admin.channels")} gradient="from-violet-400 to-purple-500" />
        <MetricCard icon={<MessageCircle className="h-5 w-5" />} label={t("admin.messages")} value={stats.totalMessages} sub={t("admin.messages")} gradient="from-orange-400 to-rose-500" />
        <MetricCard icon={<TrendingUp className="h-5 w-5" />} label={t("admin.newToday")} value={stats.newUsersToday} sub={t("admin.newToday")} gradient="from-cyan-400 to-sky-500" />
        <MetricCard icon={<Sparkles className="h-5 w-5" />} label={t("admin.newThisWeek")} value={stats.newUsersThisWeek} sub={t("admin.newThisWeek")} gradient="from-blue-400 to-indigo-500" />
        <MetricCard icon={<Radio className="h-5 w-5" />} label={t("admin.messagesToday")} value={stats.messagesToday} sub={t("admin.messagesToday")} gradient="from-pink-400 to-fuchsia-500" />
        <MetricCard icon={<Layers3 className="h-5 w-5" />} label={t("admin.messagesThisWeek")} value={stats.messagesThisWeek} sub={t("admin.messagesThisWeek")} gradient="from-purple-400 to-pink-500" />
      </div>

      {/* Bright Visualization Panel */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white/85 p-4 shadow-[0_18px_50px_rgba(59,130,246,0.15)] backdrop-blur-xl md:p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.14),transparent_30%)]" />

        <div className="relative mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 p-3 text-white shadow-lg">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{t("admin.dataVisualization")}</h3>
              <p className="text-xs text-slate-400">Digital Data Visualization</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-600 md:flex">
            <CircleDot className="h-3 w-3" />
            REAL TIME
          </div>
        </div>

        <div className="relative grid gap-4 md:grid-cols-2">
          {chartData.map((d) => {
            const width = (d.value / maxVal) * 100;
            const Icon = d.icon;

            return (
              <div key={d.label} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("rounded-xl bg-gradient-to-br p-2 text-white", d.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-slate-600">{d.label}</span>
                  </div>

                  <span className="font-mono text-sm font-bold text-slate-900">
                    {d.value.toLocaleString()}
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-white">
                  <div
                    className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", d.color)}
                    style={{
                      width: `${width}%`,
                      minWidth: d.value > 0 ? 10 : 0,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini System Indicators */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: ShieldCheck, label: t("admin.securityStatus"), value: t("admin.stable"), color: "text-emerald-500" },
          { icon: Wifi, label: t("admin.connectionStatus"), value: t("admin.normal"), color: "text-sky-500" },
          { icon: Gauge, label: t("admin.runEfficiency"), value: t("admin.excellent"), color: "text-indigo-500" },
          { icon: Zap, label: t("admin.syncPerformance"), value: t("admin.highSpeed"), color: "text-orange-500" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-3xl border border-white bg-white/80 p-4 shadow-[0_10px_30px_rgba(59,130,246,0.12)]"
          >
            <item.icon className={cn("h-5 w-5", item.color)} />
            <div>
              <div className="text-xs text-slate-400">{item.label}</div>
              <div className="text-sm font-bold text-slate-800">{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
