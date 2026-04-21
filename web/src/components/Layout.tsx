'use client';
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LayoutDashboard,
  List,
  FileText,
  Settings2,
  Cpu,
  CheckCircle,
  Layers,
  Puzzle,
  Users,
  User,
  LogOut,
  Bell,
  Coins,
  Sun,
  Moon,
  Monitor,
  ChevronsUpDown,
  ChevronRight,
  Settings,
  Package,
  UserCog,
  KeyRound,
  Swords,
  ShipWheel,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import { useAccessControl } from "@/hooks/useAccessControl";
import { menuKeyAllowed, type AccessMenuKey } from "@/lib/access-catalog";
import { clearAuthSession, getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { RequireRouteAccess } from "@/components/require-route-access";
import { useMarkSiteMessageRead, useRequirementsList, useSiteMessagesList } from "@/lib/rd-hooks";

const isDashboardPath = (pathname: string) =>
  pathname === "/" || pathname === "/dashboard";

const isSettingsSectionActive = (pathname: string) =>
  pathname === "/org-spec-config" ||
  pathname === "/plugins" ||
  pathname === "/skills" ||
  pathname.startsWith("/plugins/") ||
  pathname === "/users" ||
  pathname.startsWith("/users/") ||
  pathname === "/settings/roles" ||
  pathname.startsWith("/settings/roles/") ||
  pathname === "/settings/permissions" ||
  pathname.startsWith("/settings/permissions/");

const isActivePath = (pathname: string, itemPath: string) => {
  if (itemPath === "/dashboard") {
    return isDashboardPath(pathname);
  }
  if (itemPath === "/org-spec-config") {
    return pathname === "/org-spec-config";
  }
  if (itemPath === "/plugins") {
    return pathname === "/plugins" || pathname === "/skills" || pathname.startsWith("/plugins/");
  }
  if (itemPath === "/users") {
    return pathname === "/users" || pathname.startsWith("/users/");
  }
  if (itemPath === "/settings/roles") {
    return pathname === "/settings/roles" || pathname.startsWith("/settings/roles/");
  }
  if (itemPath === "/settings/permissions") {
    return pathname === "/settings/permissions" || pathname.startsWith("/settings/permissions/");
  }
  if (itemPath === "/requirements") {
    return (
      pathname === "/requirements" ||
      (pathname.startsWith("/requirements/") && !pathname.startsWith("/requirements/new"))
    );
  }
  return pathname === itemPath || pathname.startsWith(itemPath + "/");
};

const menuButtonClass = (isActive: boolean) =>
  cn(
    "rounded-xl transition-colors duration-200",
    isActive
      ? "border border-primary/30 bg-primary/15 shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_0.06)]"
      : "border border-transparent hover:border-sidebar-border hover:bg-sidebar-accent/80"
  );

const LayoutContent = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const userInfo = useCurrentUserProfile();
  const authUser = getCurrentUser();
  const avatarSrc = authUser?.avatarUrl?.trim() || userInfo.avatar?.trim();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { data: requirements = [] } = useRequirementsList();
  const { permissions } = useAccessControl();

  const navOk = (key: AccessMenuKey) => menuKeyAllowed(key, permissions);
  const settingsNavVisible =
    navOk("settings_org_spec") ||
    navOk("settings_plugins") ||
    navOk("settings_users") ||
    navOk("settings_roles") ||
    navOk("settings_permissions");

  const [settingsOpen, setSettingsOpen] = useState(() => isSettingsSectionActive(pathname));
  const [themeMounted, setThemeMounted] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (isSettingsSectionActive(pathname)) {
      setSettingsOpen(true);
    }
  }, [pathname]);

  useEffect(() => {
    setThemeMounted(true);
  }, []);

  const themeLabel =
    theme === "light"
      ? "白天"
      : theme === "dark"
        ? "黑夜"
        : `自动（当前${resolvedTheme === "dark" ? "黑夜" : "白天"}）`;

  const displayName = userInfo.name || authUser?.username || "用户";

  const siteUserId = userInfo.user_id?.trim() || authUser?.id?.trim() || "";
  const { data: siteMessages = [], isLoading: siteMessagesLoading } = useSiteMessagesList(
    siteUserId || undefined
  );
  const markSiteRead = useMarkSiteMessageRead();
  const unreadSiteCount = siteMessages.filter((m) => !m.readAt).length;

  const coinStats = requirements.reduce((sum, req) => {
    const records = req.taskAcceptances ?? [];
    for (const record of records) {
      if (record.userId === userInfo.user_id) {
        sum += Number(record.coins) || 0;
      }
    }
    return sum;
  }, 0);

  const handleLogout = async () => {
    clearAuthSession();
    router.replace("/login");
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/" className="gap-3 items-start">
                  <span className="flex shrink-0 pt-0.5">
                    <ShipWheel
                      className="h-10 w-10 text-blue-700 dark:text-cyan-100"
                      aria-hidden
                    />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600 bg-clip-text text-base font-extrabold leading-none tracking-wide text-transparent drop-shadow-[0_2px_4px_rgba(59,130,246,0.35)] dark:from-cyan-200 dark:via-blue-200 dark:to-purple-200 dark:drop-shadow-[0_2px_6px_rgba(125,211,252,0.45)]">
                      AI智研平台
                    </span>
                    <div className="flex min-w-0 max-w-full items-center gap-1.5">
                      <span className="h-px w-6 shrink-0 bg-gradient-to-r from-transparent via-blue-500/70 to-blue-500/30 dark:via-cyan-300/80 dark:to-cyan-300/30" />
                      <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700/90 dark:text-cyan-100/90">
                        AI-Driven SDLC
                      </span>
                      <span className="h-px w-6 shrink-0 bg-gradient-to-l from-transparent via-blue-500/70 to-blue-500/30 dark:via-cyan-300/80 dark:to-cyan-300/30" />
                    </div>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {navOk("dashboard") ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isDashboardPath(pathname)}
                      tooltip="仪表板"
                      className={menuButtonClass(isDashboardPath(pathname))}
                    >
                      <Link href="/dashboard" className="gap-3">
                        <LayoutDashboard
                          className={cn(
                            "size-5",
                            isDashboardPath(pathname) ? "text-primary" : "text-muted-foreground"
                          )}
                        />
                        <span
                          className={cn(
                            isDashboardPath(pathname)
                              ? "font-semibold text-primary"
                              : "text-sidebar-foreground/85"
                          )}
                        >
                          仪表板
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {(
                  [
                    { path: "/bounty-hunt", label: "赏金猎场", icon: Swords, key: "bounty_hunt" as const },
                    { path: "/requirements", label: "需求管理", icon: List, key: "requirements" as const },
                    { path: "/prd", label: "智能文档", icon: FileText, key: "prd" as const },
                    { path: "/specification", label: "技术基准", icon: Settings2, key: "spec" as const },
                    { path: "/ai-pipeline", label: "交付引擎", icon: Cpu, key: "pipeline" as const },
                    { path: "/acceptance", label: "验收中心", icon: CheckCircle, key: "acceptance" as const },
                  ] as const
                )
                  .filter((item) => navOk(item.key))
                  .map((item) => {
                    const isActive = isActivePath(pathname, item.path);
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={menuButtonClass(isActive)}
                        >
                          <Link href={item.path} className="gap-3">
                            <Icon
                              className={cn(
                                "size-5",
                                isActive ? "text-primary" : "text-muted-foreground"
                              )}
                            />
                            <span
                              className={cn(
                                isActive ? "font-semibold text-primary" : "text-sidebar-foreground/85"
                              )}
                            >
                              {item.label}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}

                {navOk("products") ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, "/products")}
                      tooltip="产品主数据"
                      className={menuButtonClass(isActivePath(pathname, "/products"))}
                    >
                      <Link href="/products" className="gap-3">
                        <Package
                          className={cn(
                            "size-5",
                            isActivePath(pathname, "/products")
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <span
                          className={cn(
                            isActivePath(pathname, "/products")
                              ? "font-semibold text-primary"
                              : "text-sidebar-foreground/85"
                          )}
                        >
                          产品主数据
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {settingsNavVisible ? (
                  <Collapsible
                    asChild
                    open={settingsOpen}
                    onOpenChange={setSettingsOpen}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isSettingsSectionActive(pathname)}
                          tooltip="设置"
                          className={menuButtonClass(isSettingsSectionActive(pathname))}
                        >
                          <Settings
                            className={cn(
                              "size-5",
                              isSettingsSectionActive(pathname)
                                ? "text-primary"
                                : "text-muted-foreground"
                            )}
                          />
                          <span
                            className={cn(
                              "flex-1 text-left",
                              isSettingsSectionActive(pathname)
                                ? "font-semibold text-primary"
                                : "text-sidebar-foreground/85"
                            )}
                          >
                            设置
                          </span>
                          <ChevronRight
                            className={cn(
                              "ml-auto size-4 shrink-0 transition-transform duration-200",
                              "group-data-[state=open]/collapsible:rotate-90"
                            )}
                          />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {navOk("settings_org_spec") ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, "/org-spec-config")}
                              >
                                <Link href="/org-spec-config">
                                  <Layers className="size-4" />
                                  <span>编码规范</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : null}
                          {navOk("settings_plugins") ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, "/plugins")}
                              >
                                <Link href="/plugins">
                                  <Puzzle className="size-4" />
                                  <span>插件配置</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : null}
                          {navOk("settings_users") ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, "/users")}
                              >
                                <Link href="/users">
                                  <Users className="size-4" />
                                  <span>用户管理</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : null}
                          {navOk("settings_roles") ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, "/settings/roles")}
                              >
                                <Link href="/settings/roles">
                                  <UserCog className="size-4" />
                                  <span>角色定义</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : null}
                          {navOk("settings_permissions") ? (
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActivePath(pathname, "/settings/permissions")}
                              >
                                <Link href="/settings/permissions">
                                  <KeyRound className="size-4" />
                                  <span>权限管理</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ) : null}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-w-0 flex-1 overflow-x-hidden">
        <header className="glass-sticky-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
          <SidebarTrigger
            className="size-9 shrink-0 rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
            aria-label="切换侧边栏"
          />
          <div className="ml-auto flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="relative size-9 shrink-0 rounded-lg border-border bg-muted/40 text-foreground shadow-none hover:bg-muted/60"
                  aria-label="站内信"
                >
                  <Bell className="size-[18px] stroke-[1.75]" />
                  {unreadSiteCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                      {unreadSiteCount > 99 ? "99+" : unreadSiteCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[min(100vw-2rem,24rem)] max-h-[min(80vh,28rem)] overflow-hidden border-border bg-popover/95 p-0 backdrop-blur-xl shadow-md"
              >
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">站内信</p>
                  <p className="text-[11px] text-muted-foreground">悬赏与系统通知</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {!siteUserId ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">登录后查看站内信</p>
                  ) : siteMessagesLoading ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">加载中…</p>
                  ) : siteMessages.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">暂无消息</p>
                  ) : (
                    siteMessages.map((m) => (
                      <DropdownMenuItem key={m.id} asChild className="cursor-pointer p-0 focus:bg-transparent">
                        <Link
                          href={m.linkUrl}
                          className={cn(
                            "flex w-full flex-col gap-1 border-b border-border/70 px-3 py-3 text-left last:border-0",
                            !m.readAt && "bg-accent/45"
                          )}
                          onClick={() => {
                            if (!m.readAt && siteUserId) {
                              void markSiteRead.mutate({ messageId: m.id, userId: siteUserId });
                            }
                          }}
                        >
                          <span className="text-xs font-semibold text-primary">{m.title}</span>
                          <span className="text-sm leading-relaxed text-foreground">{m.body}</span>
                          <span className="text-xs font-medium text-primary underline underline-offset-2">
                            前往赏金猎场
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="h-7 w-px shrink-0 bg-border" aria-hidden />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 max-w-[min(100%,240px)] gap-2 rounded-lg px-2 text-foreground hover:bg-accent"
                  aria-label={`${displayName}，打开账户菜单`}
                >
                  <Avatar className="size-8 shrink-0 border border-border bg-muted/50">
                    {avatarSrc ? (
                      <AvatarImage src={avatarSrc} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <User className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate text-left text-sm font-medium">
                    {displayName}
                  </span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="end"
                className={cn(
                  "min-w-48 border-border bg-popover/95 text-foreground backdrop-blur-xl",
                  "shadow-md"
                )}
              >
                <DropdownMenuItem
                  className="cursor-default focus:bg-accent focus:text-accent-foreground"
                  onSelect={(event) => event.preventDefault()}
                >
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">主题</span>
                    <div
                      className={cn(
                        "inline-flex rounded-full border border-border bg-card p-1 shadow-sm",
                        !themeMounted && "pointer-events-none opacity-60"
                      )}
                      role="radiogroup"
                      aria-label="主题切换"
                    >
                      {[
                        { id: "light", label: "浅色", icon: Sun },
                        { id: "dark", label: "深色", icon: Moon },
                        { id: "system", label: "跟随系统", icon: Monitor },
                      ].map((item) => {
                        const Icon = item.icon;
                        const active = themeMounted && theme === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={item.label}
                            disabled={!themeMounted}
                            onClick={() => setTheme(item.id)}
                            className={cn(
                              "relative flex size-8 items-center justify-center rounded-full transition-colors",
                              active ? "text-background" : "text-foreground hover:bg-accent/80"
                            )}
                          >
                            {active ? (
                              <span className="absolute inset-0 rounded-full bg-foreground shadow-sm" aria-hidden />
                            ) : null}
                            <Icon className="relative z-[1] size-4 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-default focus:bg-accent focus:text-accent-foreground"
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="flex w-full items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Coins className="size-4 text-amber-500" />
                      金币
                    </span>
                    <span className="font-mono font-medium text-amber-600">{coinStats}</span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="focus:bg-accent focus:text-accent-foreground">
                  <Link href="/settings">
                    <Settings className="mr-2 size-4" />
                    <span>个人设置</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="focus:bg-accent focus:text-accent-foreground"
                >
                  <LogOut className="mr-2 size-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="rd-content-canvas min-w-0 flex-1 px-6 py-8">
          <RequireRouteAccess pathname={pathname}>{children}</RequireRouteAccess>
        </div>
      </SidebarInset>
    </>
  );
};

const Layout = ({ children }: { children: ReactNode }) => {
  return (
    <SidebarProvider className="app-shell min-h-svh w-full">
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
};

export default Layout;
