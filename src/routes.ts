import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  layout("routes/_public.tsx", [
    index("routes/home.tsx"),
    route("menu/:categorySlug?", "routes/menu.tsx"),
    route("menu/item/:productSlug", "routes/product.tsx"),
    route("offers", "routes/offers.tsx"),
    route("about", "routes/about.tsx"),
    route("contact", "routes/contact.tsx"),
    route("privacy", "routes/policy.tsx", { id: "privacy" }),
    route("terms", "routes/policy.tsx", { id: "terms" }),
    route("cart", "routes/cart.tsx"),
    route("login", "routes/auth/login.tsx"),
    route("register", "routes/auth/register.tsx"),
    route("forgot-password", "routes/auth/forgot-password.tsx"),
    route("reset-password", "routes/auth/reset-password.tsx"),
    route("auth/callback", "routes/auth/callback.tsx"),
    route("account", "routes/account/index.tsx"),
    route("*", "routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
