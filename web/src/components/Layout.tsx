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
  ChevronsUpDown,
  ChevronRight,
  Settings,
  Package,
  UserCog,
  KeyRound,
} from "lucide-react";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import { useAccessControl } from "@/hooks/useAccessControl";
import { menuKeyAllowed, type AccessMenuKey } from "@/lib/access-catalog";
import { clearAuthSession, getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { RequireRouteAccess } from "@/components/require-route-access";

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
  const { permissions } = useAccessControl();

  const navOk = (key: AccessMenuKey) => menuKeyAllowed(key, permissions);
  const settingsNavVisible =
    navOk("settings_org_spec") ||
    navOk("settings_plugins") ||
    navOk("settings_users") ||
    navOk("settings_roles") ||
    navOk("settings_permissions");

  const [settingsOpen, setSettingsOpen] = useState(() => isSettingsSectionActive(pathname));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (isSettingsSectionActive(pathname)) {
      setSettingsOpen(true);
    }
  }, [pathname]);

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
                <Link href="/" className="gap-3">
                  <div
                    className={cn(
                      "flex aspect-square size-10 items-center justify-center rounded-xl",
                      "border border-primary/25 bg-primary/10 shadow-[0_0_24px_hsl(217_91%_60%_/_0.2)]"
                    )}
                  >
                    <Cpu className="size-5 text-primary" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-bold text-[hsl(210_40%_98%)] text-base tracking-tight">
                      AI智研平台
                    </span>
                    <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                      R&D Management
                    </span>
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

                {navOk("requirements") ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActivePath(pathname, "/requirements")}
                      tooltip="需求列表"
                      className={menuButtonClass(isActivePath(pathname, "/requirements"))}
                    >
                      <Link href="/requirements" className="gap-3">
                        <List
                          className={cn(
                            "size-5",
                            isActivePath(pathname, "/requirements")
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <span
                          className={cn(
                            isActivePath(pathname, "/requirements")
                              ? "font-semibold text-primary"
                              : "text-sidebar-foreground/85"
                          )}
                        >
                          需求清单
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {(
                  [
                    { path: "/prd", label: "PRD文档", icon: FileText, key: "prd" as const },
                    { path: "/specification", label: "规格说明书", icon: Settings2, key: "spec" as const },
                    { path: "/ai-pipeline", label: "流水线", icon: Cpu, key: "pipeline" as const },
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
                      tooltip="产品管理"
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
                          产品管理
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-lg border-border bg-muted/40 text-foreground shadow-none hover:bg-muted/60"
              aria-label="通知"
            >
              <Bell className="size-[18px] stroke-[1.75]" />
            </Button>
            <div className="h-7 w-px shrink-0 bg-border" aria-hidden />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-2 rounded-lg px-2 text-foreground hover:bg-accent"
                >
                  <Avatar className="size-8 border border-border bg-muted/50">
                    {avatarSrc ? (
                      <AvatarImage src={avatarSrc} alt="" className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <User className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="sr-only">
                    {userInfo.name || authUser?.username || "用户"}，打开账户菜单
                  </span>
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
