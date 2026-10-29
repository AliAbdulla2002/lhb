import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import i18n, { dirOf, setLang } from "~/i18n";
import { ProductCard } from "~/features/menu/ProductCard";
import type { Product } from "~/lib/api/types";

const product: Product = {
  id: "p",
  category_id: "c",
  slug: "chicken",
  name_ar: "شاورما دجاج",
  name_en: "Chicken shawarma",
  description_ar: null,
  description_en: null,
  base_price: 1,
  is_available: false,
  is_featured: true,
  is_best_seller: true,
  sort_order: 0,
  product_images: [],
};

function renderCard() {
  const Stub = createRoutesStub([{ path: "/", Component: () => <ProductCard product={product} /> }]);
  return render(<Stub />);
}

afterEach(() => setLang("ar"));

test("Arabic is right-to-left and English left-to-right", () => {
  expect(dirOf("ar")).toBe("rtl");
  expect(dirOf("en")).toBe("ltr");
});

test("renders Arabic names, BHD price and unavailable state", async () => {
  setLang("ar");
  renderCard();
  expect(await screen.findByRole("heading", { name: "شاورما دجاج" })).toBeInTheDocument();
  expect(screen.getByText("غير متوفر حالياً")).toBeInTheDocument();
  expect(screen.getByText(/1[.٫]000/)).toBeInTheDocument();
});

test("switches to English", async () => {
  setLang("en");
  renderCard();
  expect(i18n.language).toBe("en");
  expect(await screen.findByRole("heading", { name: "Chicken shawarma" })).toBeInTheDocument();
  expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Chicken shawarma" })).toHaveAttribute("href", "/menu/item/chicken");
});
