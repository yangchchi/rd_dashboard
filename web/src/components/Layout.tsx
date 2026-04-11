'use client';
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LayoutDashboard,
  PlusCircle,
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
  ChevronUp,
  ChevronRight,
  ClipboardList,
  Settings,
  Package,
  UserCog,
  KeyRound,
} from "lucide-react";
import { useCurrentUserProfile } from "@/hooks/useCurrentUserProfile";
import { clearAuthSession, getCurrentUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const isDashboardPath = (pathname: string) =>
  pathname === "/" || pathname === "/dashboard";

const isRequirementSectionActive = (pathname: string) =>
  pathname === "/requirements/new" ||
  pathname === "/requirements" ||
  pathname.startsWith("/requirements/");

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

  const [requirementOpen, setRequirementOpen] = useState(() => isRequirementSectionActive(pathname));
  const [settingsOpen, setSettingsOpen] = useState(() => isSettingsSectionActive(pathname));

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (isRequirementSectionActive(pathname)) {
      setRequirementOpen(true);
    }
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

                <Collapsible
                  asChild
                  open={requirementOpen}
                  onOpenChange={setRequirementOpen}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        isActive={isRequirementSectionActive(pathname)}
                        tooltip="需求管理"
                        className={menuButtonClass(isRequirementSectionActive(pathname))}
                      >
                        <ClipboardList
                          className={cn(
                            "size-5",
                            isRequirementSectionActive(pathname)
                              ? "text-primary"
                              : "text-muted-foreground"
                          )}
                        />
                        <span
                          className={cn(
                            "flex-1 text-left",
                            isRequirementSectionActive(pathname)
                              ? "font-semibold text-primary"
                              : "text-sidebar-foreground/85"
                          )}
                        >
                          需求管理
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
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActivePath(pathname, "/requirements/new")}
                          >
                            <Link href="/requirements/new">
                              <PlusCircle className="size-4" />
                              <span>需求采集</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={
                              pathname === "/requirements" ||
                              (pathname.startsWith("/requirements/") &&
                                !pathname.startsWith("/requirements/new"))
                            }
                          >
                            <Link href="/requirements">
                              <List className="size-4" />
                              <span>需求列表</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>

                {(
                  [
                    { path: "/prd", label: "PRD管理", icon: FileText },
                    { path: "/specification", label: "规格说明书", icon: Settings2 },
                    { path: "/ai-pipeline", label: "AI开发监控", icon: Cpu },
                    { path: "/acceptance", label: "验收中心", icon: CheckCircle },
                  ] as const
                ).map((item) => {
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
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActivePath(pathname, "/org-spec-config")}
                          >
                            <Link href="/org-spec-config">
                              <Layers className="size-4" />
                              <span>组织规格</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
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
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border pt-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className={cn(
                      "rounded-xl border border-transparent hover:border-sidebar-border hover:bg-sidebar-accent/80"
                    )}
                  >
                    <div className="flex size-8 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/50 backdrop-blur-[var(--blur-glass-10)]">
                      <User className="size-4 text-muted-foreground" />
                    </div>
                    <span className="truncate text-muted-foreground">
                      {authUser?.username || userInfo.name || "用户"}
                    </span>
                    <ChevronUp className="ml-auto size-4 text-muted-foreground" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  className={cn(
                    "w-[--radix-popper-anchor-width] border-border bg-popover/95 text-foreground backdrop-blur-xl",
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
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 flex-1 overflow-x-hidden">
        <header className="glass-sticky-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger
            className="size-9 shrink-0 rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
            aria-label="切换侧边栏"
          />
        </header>
        <div className="rd-content-canvas min-w-0 flex-1 px-6 py-8">{children}</div>
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
