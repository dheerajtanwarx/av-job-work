"use client";

import type { Client, Design, Product, Settings } from "@av/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export const useClients = (active = true) =>
  useQuery({ queryKey: ["clients", "simple", active], queryFn: () => api.get<Client[]>(`/clients?simple=true${active ? "&active=true" : ""}`) });

export const useProducts = (active = true) =>
  useQuery({ queryKey: ["products", active], queryFn: () => api.get<Product[]>(`/products${active ? "?active=true" : ""}`) });

export const useDesigns = (active = true) =>
  useQuery({ queryKey: ["designs", active], queryFn: () => api.get<Design[]>(`/designs${active ? "?active=true" : ""}`) });

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });
