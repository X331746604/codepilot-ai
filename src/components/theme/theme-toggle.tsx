"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "浅色", icon: SunIcon },
  { value: "dark", label: "深色", icon: MoonIcon },
  { value: "system", label: "跟随系统", icon: MonitorIcon },
] as const;

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  // 服务端拿不到用户偏好，也不能在 effect 里同步 setState（会触发级联渲染）。
  // useSyncExternalStore 在服务端返回 false、水合完成后返回 true，
  // 是官方推荐的"是否已挂载"判断方式。
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const ActiveIcon = !mounted ? MonitorIcon : resolvedTheme === "dark" ? MoonIcon : SunIcon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换主题">
          <ActiveIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>外观</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = mounted && theme === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setTheme(option.value)}
              className="justify-between"
            >
              <span className="flex items-center gap-2">
                <Icon className="size-4" />
                {option.label}
              </span>
              {isActive ? <CheckIcon className="size-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
