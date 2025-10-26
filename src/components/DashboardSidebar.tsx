'use client';

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge"
import {
  FolderOpen,
  Key,
  CreditCard,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, createContext, useContext, ReactNode } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  sidebarWidth: string;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const sidebarWidth = isCollapsed ? "3.05rem" : "15rem";

  return (
    <SidebarContext.Provider value={{ isCollapsed, sidebarWidth }}>
      <div className="flex h-full">
        <DashboardSidebar onCollapsedChange={setIsCollapsed} />
        {children}
      </div>
    </SidebarContext.Provider>
  );
};

const sidebarVariants = {
  open: {
    width: "15rem",
  },
  closed: {
    width: "3.05rem",
  },
};

const contentVariants = {
  open: { display: "block", opacity: 1 },
  closed: { display: "block", opacity: 1 },
};

const variants = {
  open: {
    x: 0,
    opacity: 1,
    transition: {
      x: { stiffness: 1000, velocity: -100 },
    },
  },
  closed: {
    x: -20,
    opacity: 0,
    transition: {
      x: { stiffness: 100 },
    },
  },
};

const transitionProps = {
  type: "tween" as const,
  ease: "easeOut" as const,
  duration: 0.2,
  staggerChildren: 0.1,
};

const staggerVariants = {
  open: {
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

function DashboardSidebar({ onCollapsedChange }: { onCollapsedChange: (collapsed: boolean) => void }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const pathname = usePathname();

  const handleCollapsedChange = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    onCollapsedChange(collapsed);
  };

  return (
    <motion.div
      className={cn(
        "sidebar fixed left-0 z-40 h-full shrink-0 border-r bg-zinc-900 border-zinc-800",
      )}
      initial={isCollapsed ? "closed" : "open"}
      animate={isCollapsed ? "closed" : "open"}
      variants={sidebarVariants}
      transition={transitionProps}
      onMouseEnter={() => handleCollapsedChange(false)}
      onMouseLeave={() => handleCollapsedChange(true)}
    >
      <motion.div
        className={`relative z-40 flex text-muted-foreground h-full shrink-0 flex-col bg-zinc-900 dark:bg-zinc-900 transition-all`}
        variants={contentVariants}
      >
        <motion.ul variants={staggerVariants} className="flex h-full flex-col">
          <div className="flex grow flex-col items-center">
            <div className="flex h-full w-full flex-col">
              <div className="flex grow flex-col gap-4">
                <ScrollArea className="h-full grow p-2">
                  <div className={cn("flex w-full flex-col gap-1")}>
                    <Link
                      href="/projects"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-zinc-800 hover:text-zinc-100",
                        pathname === "/projects" && "bg-zinc-800 text-zinc-100",
                      )}
                    >
                      <FolderOpen className="h-4 w-4 text-zinc-400" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <p className="ml-2 text-sm font-medium text-zinc-400">Projects</p>
                        )}
                      </motion.li>
                    </Link>
                    <Link
                      href="/api-keys"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-zinc-800 hover:text-zinc-100",
                        pathname === "/api-keys" && "bg-zinc-800 text-zinc-100",
                      )}
                    >
                      <Key className="h-4 w-4 text-zinc-400" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <p className="ml-2 text-sm font-medium text-zinc-400">API Keys</p>
                        )}
                      </motion.li>
                    </Link>
                    <Link
                      href="/billing"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-zinc-800 hover:text-zinc-100",
                        pathname === "/billing" && "bg-zinc-800 text-zinc-100",
                      )}
                    >
                      <CreditCard className="h-4 w-4 text-zinc-400" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <p className="ml-2 text-sm font-medium text-zinc-400">Billing</p>
                        )}
                      </motion.li>
                    </Link>
                    <Link
                      href="/settings"
                      className={cn(
                        "flex h-8 w-full flex-row items-center rounded-md px-2 py-1.5 transition hover:bg-zinc-800 hover:text-zinc-100",
                        pathname === "/settings" && "bg-zinc-800 text-zinc-100",
                      )}
                    >
                      <Settings className="h-4 w-4 shrink-0 text-zinc-400" />
                      <motion.li variants={variants}>
                        {!isCollapsed && (
                          <p className="ml-2 text-sm font-medium text-zinc-400">Settings</p>
                        )}
                      </motion.li>
                    </Link>
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </motion.ul>
      </motion.div>
    </motion.div>
  );
}
