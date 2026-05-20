'use client';
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
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
  useSidebar,
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
    "group-data-[collapsible=icon]:[&_svg]:!size-5",
    isActive
      ? "border border-primary/30 bg-primary/15 shadow-[inset_0_1px_0_0_hsl(0_0%_100%_/_0.06)]"
      : "border border-transparent hover:border-sidebar-border hover:bg-sidebar-accent/80"
  );

/** 展开/收起均为 20px（size-5），收起时加粗描边并覆盖 sidebar 默认 [&>svg]:size-4 */
const navIconClass = (isActive: boolean) =>
  cn(
    "size-5 shrink-0 stroke-[1.75]",
    "group-data-[collapsible=icon]:!size-5 group-data-[collapsible=icon]:!h-5 group-data-[collapsible=icon]:!w-5 group-data-[collapsible=icon]:stroke-[2]",
    isActive ? "text-primary" : "text-sidebar-foreground/65"
  );

const LayoutContent = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { state, setOpen, isMobile } = useSidebar();
  const userInfo = useCurrentUserProfile();
  const authUser = getCurrentUser();
  const avatarSrc = authUser?.avatarUrl?.trim() || userInfo.avatar?.trim();
  const { theme, setTheme } = useTheme();
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

  const handleBrandLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isMobile && state === "collapsed") {
      event.preventDefault();
      setOpen(true);
    }
  };

  /** 妙搭式：桌面展开时显示收缩钮；收缩时隐藏，由点击 Logo 展开。移动端抽屉内保留关闭入口。 */
  const showCollapseInSidebarHeader = isMobile || state === "expanded";

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="shrink-0 px-2 pb-2 pt-2">
          <div className="flex min-h-14 w-full min-w-0 items-center gap-1">
            <SidebarMenu className="min-w-0 flex-1">
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" asChild>
                  <Link
                    href="/"
                    onClick={handleBrandLinkClick}
                    aria-label={!isMobile && state === "collapsed" ? "展开侧边栏" : undefined}
                    title={!isMobile && state === "collapsed" ? "点击展开侧边栏" : undefined}
                    className="min-w-0 gap-3 items-center"
                  >
                    <span className="flex shrink-0">
                      <ShipWheel
                        className="h-8 w-8 text-blue-700 dark:text-white"
                        aria-hidden
                      />
                    </span>
                    <div className="grid min-w-0 flex-1 gap-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                      <span className="truncate bg-gradient-to-r from-blue-700 via-indigo-600 to-violet-600 bg-clip-text text-lg font-extrabold leading-none tracking-widest text-transparent drop-shadow-[0_2px_4px_rgba(59,130,246,0.35)] dark:bg-none dark:text-white dark:drop-shadow-none">
                        HAI智研平台
                      </span>
                      <div className="flex min-w-0 max-w-full items-center gap-1.5">
                        <span className="h-px w-4 shrink-0 bg-gradient-to-r from-transparent via-blue-500/70 to-blue-500/30 dark:via-white/35 dark:to-white/15" />
                        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700/90 dark:text-white/90">
                          AI-Driven SDLC
                        </span>
                        <span className="h-px w-4 shrink-0 bg-gradient-to-l from-transparent via-blue-500/70 to-blue-500/30 dark:via-white/35 dark:to-white/15" />
                      </div>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            {showCollapseInSidebarHeader ? (
              <SidebarTrigger
                className="size-8 shrink-0 rounded-md text-sidebar-foreground/70 shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
                aria-label="收起侧边栏"
              />
            ) : null}
          </div>
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
                      tooltip="智研看板"
                      className={menuButtonClass(isDashboardPath(pathname))}
                    >
                      <Link href="/dashboard" className="gap-3">
                        <LayoutDashboard className={navIconClass(isDashboardPath(pathname))} />
                        <span
                          className={cn(
                            isDashboardPath(pathname)
                              ? "font-semibold text-primary"
                              : "font-medium text-sidebar-foreground/90"
                          )}
                        >
                          智研看板
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {(
                  [
                    { path: "/bounty-hunt", label: "赏金猎场", icon: Swords, key: "bounty_hunt" as const },
                    { path: "/requirements", label: "需求中心", icon: List, key: "requirements" as const },
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
                            <Icon className={navIconClass(isActive)} />
                            <span
                              className={cn(
                                isActive ? "font-semibold text-primary" : "font-medium text-sidebar-foreground/90"
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
                        <Package className={navIconClass(isActivePath(pathname, "/products"))} />
                        <span
                          className={cn(
                            isActivePath(pathname, "/products")
                              ? "font-semibold text-primary"
                              : "font-medium text-sidebar-foreground/90"
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
                          className={cn(
                            menuButtonClass(isSettingsSectionActive(pathname)),
                            "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                          )}
                        >
                          <Settings className={navIconClass(isSettingsSectionActive(pathname))} />
                          <span
                            className={cn(
                              "flex-1 text-left group-data-[collapsible=icon]:hidden",
                              isSettingsSectionActive(pathname)
                                ? "font-semibold text-primary"
                                : "font-medium text-sidebar-foreground/90"
                            )}
                          >
                            设置
                          </span>
                          <ChevronRight
                            className={cn(
                              "ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden",
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

        <SidebarFooter className="mt-auto shrink-0 px-3 py-3">
          <div
            className={cn(
              "flex w-full min-w-0 items-center justify-between gap-2",
              "group-data-[collapsible=icon]:flex-col-reverse group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-3"
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 min-w-0 flex-1 justify-start gap-2 rounded-lg px-2 text-sidebar-foreground shadow-none ring-0 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-1.5"
                  aria-label={`${displayName}，打开账户菜单`}
                >
                  <Avatar className="size-8 shrink-0 border-0 bg-transparent ring-0 group-data-[collapsible=icon]:!size-5">
                    {avatarSrc ? (
                      <AvatarImage src={avatarSrc} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-transparent text-sidebar-foreground/90">
                      <User className="size-4 shrink-0 stroke-[1.75] group-data-[collapsible=icon]:!size-5 group-data-[collapsible=icon]:!h-5 group-data-[collapsible=icon]:!w-5 group-data-[collapsible=icon]:stroke-[2]" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-left text-sm font-medium group-data-[collapsible=icon]:hidden">
                    {displayName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative size-9 shrink-0 rounded-lg text-sidebar-foreground/80 shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  aria-label="站内信"
                >
                  <Bell className="size-[18px] shrink-0 stroke-[1.75] group-data-[collapsible=icon]:!size-5 group-data-[collapsible=icon]:!h-5 group-data-[collapsible=icon]:!w-5 group-data-[collapsible=icon]:stroke-[2]" />
                  {unreadSiteCount > 0 ? (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                      {unreadSiteCount > 99 ? "99+" : unreadSiteCount}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
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
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="relative min-w-0 flex-1 overflow-x-hidden">
        <SidebarTrigger
          className="absolute left-3 top-3 z-30 size-10 shrink-0 rounded-lg border border-border bg-card/95 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-accent hover:text-primary md:hidden"
          aria-label="打开菜单"
        />
        <div className="rd-content-canvas min-h-0 min-w-0 w-full flex-1 px-4 pb-6 pt-14 sm:px-6 sm:pb-8 md:px-6 md:py-8 md:pt-8 lg:px-8">
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
