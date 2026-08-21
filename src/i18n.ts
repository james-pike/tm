import { createContextId } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";

export type Locale = "en" | "fr";

export const LocaleContext = createContextId<Signal<Locale>>("locale");

const translations = {
  // Footer / privacy
  "footer.privacypolicy": { en: "Privacy Policy", fr: "Politique de confidentialité" },
  "privacy.title": { en: "Privacy Policy", fr: "Politique de confidentialité" },
  "privacy.body": { en: "This application is intended for internal use only. Customer names are stored in the database alongside the order number and order details, so that each order can be matched to the person who placed it. Email addresses and phone numbers are not stored in the database; this information appears only in order confirmation emails, which are processed by a third-party email provider (Resend) and retained for up to 30 days before deletion. To learn more, please contact info@tamarackapparel.ca.", fr: "Cette application est réservée à un usage interne. Le nom du client est conservé dans la base de données, avec le numéro de commande et le détail de la commande, afin que chaque commande puisse être associée à la personne qui l'a passée. Les adresses courriel et les numéros de téléphone ne sont pas conservés dans la base de données; ces renseignements figurent uniquement dans les courriels de confirmation de commande, traités par un fournisseur de courriel tiers (Resend) et conservés pendant un maximum de 30 jours avant leur suppression. Pour en savoir plus, veuillez communiquer avec info@tamarackapparel.ca." },
  // Header nav
  "logo.apparel": { en: "Apparel", fr: "Vêtements" },
  "nav.home": { en: "Home", fr: "Accueil" },
  "nav.menu": { en: "Menu", fr: "Menu" },
  "nav.apparel": { en: "Apparel", fr: "Vêtements" },
  "nav.shirts": { en: "Shirts", fr: "Chandails" },
  "nav.polos": { en: "Polos", fr: "Polos" },
  "nav.hoodies": { en: "Hoodies", fr: "Kangourous" },
  "nav.hats": { en: "Headwear", fr: "Couvre-chefs" },
  "nav.caps": { en: "Caps", fr: "Casquettes" },
  "nav.jackets": { en: "Jackets", fr: "Manteaux" },
  "nav.safety": { en: "Safety", fr: "Sécurité" },
  "search.placeholder": { en: "Search apparel", fr: "Rechercher des vêtements" },
  "search.placeholder.short": { en: "Search...", fr: "Rechercher..." },

  // Login modal
  "login.title": { en: "Employee Login", fr: "Connexion employé" },
  "login.subtitle": { en: "Login to access apparel", fr: "Connectez-vous pour accéder aux vêtements" },
  "login.username": { en: "Username", fr: "Nom d'utilisateur" },
  "login.username.placeholder": { en: "Enter username", fr: "Entrez le nom d'utilisateur" },
  "login.password": { en: "Password", fr: "Mot de passe" },
  "login.password.placeholder": { en: "Enter password", fr: "Entrez le mot de passe" },
  "login.submit": { en: "Login", fr: "Se connecter" },
  "login.submitting": { en: "Signing in...", fr: "Connexion..." },
  "login.error": { en: "Invalid username or password", fr: "Nom d'utilisateur ou mot de passe invalide" },
  "login.logout": { en: "Log out", fr: "Déconnexion" },

  // Hero
  "hero.badge": { en: "Employee Exclusive", fr: "Exclusif employés" },
  "hero.accent": { en: "Wear", fr: "Portez" },
  "hero.title.your": { en: "Your", fr: "Votre" },
  "hero.title.brand": { en: "Brand", fr: "Marque" },
  "hero.subtitle": {
    en: "From the jobsite to the office.",
    fr: "Du chantier au bureau.",
  },

  "hero.explore": { en: "Explore Apparel", fr: "Explorer les vêtements" },
  "hero.browse": { en: "Browse Apparel", fr: "Parcourir les vêtements" },

  // Hero photo labels
  "hero.label.onthejob": { en: "On the Job", fr: "Au travail" },
  "hero.label.polos": { en: "Polos", fr: "Polos" },
  "hero.label.hats": { en: "Headwear", fr: "Couvre-chefs" },

  // Teaser cards
  "teaser.all.tag": { en: "Full Collection", fr: "Collection complète" },
  "teaser.all.title": { en: "All Apparel", fr: "Les Vêtements" },
  "teaser.all.text": { en: "Browse the complete Tamarack branded collection.", fr: "Parcourez la collection complète Tamarack." },
  "teaser.all.cta": { en: "Browse Apparel", fr: "Parcourir les vêtements" },
  "teaser.jackets.tag": { en: "Cold Weather", fr: "Temps froid" },
  "teaser.jackets.title": { en: "Jackets & Hoodies", fr: "Manteaux et hoodies" },
  "teaser.jackets.text": { en: "Softshell and insulated options built for Canadian weather.", fr: "Options softshell et isolées conçues pour le climat canadien." },
  "teaser.jackets.cta": { en: "Shop Jackets", fr: "Voir les manteaux" },

  "teaser.polos.tag": { en: "Team Favourite", fr: "Favori de l'équipe" },
  "teaser.polos.title": { en: "Classic Shirts", fr: "Chemises classiques" },
  "teaser.polos.text": { en: "The go-to for site visits and the office.", fr: "L'incontournable pour les visites de chantier et le bureau." },
  "teaser.polos.cta": { en: "Shop Polos", fr: "Voir les polos" },

  "teaser.hoodies.tag": { en: "Cold Weather", fr: "Temps froid" },
  "teaser.hoodies.title": { en: "Hoodies & Layers", fr: "Kangourous et couches" },
  "teaser.hoodies.text": { en: "Pullover and zip-up hoodies for cooler days.", fr: "Kangourous à enfiler et à fermeture éclair pour les journées fraîches." },
  "teaser.hoodies.cta": { en: "Shop Hoodies", fr: "Voir les kangourous" },

  "teaser.hats.tag": { en: "Headwear", fr: "Couvre-chefs" },
  "teaser.hats.title": { en: "Headwear", fr: "Couvre-chefs" },
  "teaser.hats.text": { en: "Embroidered caps and knit beanies for every season.", fr: "Casquettes brodées et tuques tricotées pour toutes les saisons." },
  "teaser.hats.cta": { en: "Shop Headwear", fr: "Voir les couvre-chefs" },

  "teaser.workwear.tag": { en: "On the Job", fr: "Au travail" },
  "teaser.workwear.title": { en: "All Apparel", fr: "Tous les vêtements" },
  "teaser.workwear.text": { en: "Durable gear built for the jobsite.", fr: "Équipement durable conçu pour le chantier." },
  "teaser.workwear.cta": { en: "Shop All Apparel", fr: "Voir tous les vêtements" },

  "teaser.tees.tag": { en: "Essentials", fr: "Essentiels" },
  "teaser.tees.title": { en: "Crew Neck Tees", fr: "T-shirts col rond" },
  "teaser.tees.text": { en: "Lightweight branded tees for everyday wear.", fr: "T-shirts légers à l'effigie de la marque pour tous les jours." },
  "teaser.tees.cta": { en: "Shop Tees", fr: "Voir les t-shirts" },

  "teaser.safety.tag": { en: "Job Site", fr: "Chantier" },
  "teaser.safety.title": { en: "Safety Gear", fr: "Équipement de sécurité" },
  "teaser.safety.text": { en: "Hi-vis vests and rain jackets that meet safety standards.", fr: "Vestes haute visibilité et imperméables conformes aux normes de sécurité." },
  "teaser.safety.cta": { en: "Shop Safety", fr: "Voir la sécurité" },

  // Shop page
  "shop.back": { en: "← All Categories", fr: "← Toutes les catégories" },
  "shop.items": { en: "items", fr: "articles" },

  // Apparel catalog
  "apparel.title": { en: "Apparel", fr: "Vêtements" },
  "apparel.all.title": { en: "All Apparel", fr: "Tous les vêtements" },
  "apparel.items": { en: "items", fr: "articles" },
  "apparel.all": { en: "All", fr: "Tous" },
  "apparel.sort.popular": { en: "Most Popular", fr: "Les plus populaires" },
  "apparel.sort.newest": { en: "Newest First", fr: "Plus récents" },
  "apparel.sort.name": { en: "Name A-Z", fr: "Nom A-Z" },

  // Product badges
  "badge.bestseller": { en: "Best Seller", fr: "Meilleur vendeur" },
  "badge.new": { en: "New", fr: "Nouveau" },
  "badge.staffpick": { en: "Staff Pick", fr: "Choix du personnel" },
  "badge.popular": { en: "Popular", fr: "Populaire" },
  "badge.required": { en: "Required", fr: "Obligatoire" },

  // Product card
  "product.specsheet": { en: "View Spec Sheet", fr: "Voir la fiche technique" },
  "product.specsheet.pdf": { en: "View Spec Sheet (PDF)", fr: "Voir la fiche technique (PDF)" },

  // Color names
  "color.green": { en: "Green", fr: "Vert" },
  "color.black": { en: "Black", fr: "Noir" },
  "color.white": { en: "White", fr: "Blanc" },
  "color.navy": { en: "Navy", fr: "Marine" },
  "color.grey": { en: "Grey", fr: "Gris" },
  "color.orange": { en: "Orange", fr: "Orange" },
  "color.safetyorange": { en: "Safety Orange", fr: "Orange sécurité" },
  "color.yellow": { en: "Yellow", fr: "Jaune" },
  "color.red": { en: "Red", fr: "Rouge" },
  "color.purple": { en: "Purple", fr: "Violet" },
  "color.royal": { en: "Royal", fr: "Bleu royal" },
  "color.greyheather": { en: "Grey Heather", fr: "Gris chiné" },
  "color.lightblue": { en: "Light Blue", fr: "Bleu clair" },
  "color.solaceblue": { en: "Solace Blue", fr: "Bleu Solace" },
  "color.silver": { en: "Silver", fr: "Argent" },
  "color.charcoal": { en: "Charcoal", fr: "Charbon" },
  "color.bronze": { en: "Bronze", fr: "Bronze" },
  "color.carharttbrown": { en: "Carhartt Brown", fr: "Brun Carhartt" },
  "color.skyblue": { en: "Sky Blue", fr: "Bleu ciel" },

  // Product modal
  "modal.material": { en: "Material", fr: "Matière" },
  "modal.size": { en: "Size", fr: "Taille" },
  "modal.color": { en: "Color", fr: "Couleur" },
  "modal.quantity": { en: "Quantity", fr: "Quantité" },
  "modal.addtocart": { en: "Add to Cart", fr: "Ajouter au panier" },
  "modal.ordernow": { en: "Order Now", fr: "Commander" },
  "modal.added": { en: "Added!", fr: "Ajouté!" },
  "modal.selectsize": { en: "Select a Size", fr: "Choisir une taille" },
  "modal.onesize": { en: "One Size", fr: "Taille unique" },

  // Cart drawer
  "cart.mycart": { en: "My Cart", fr: "Mon panier" },
  "cart.title": { en: "MY CART", fr: "PANIER" },
  "cart.empty": { en: "Your cart is empty", fr: "Votre panier est vide" },
  "cart.backtoapparel": { en: "Back to Apparel", fr: "Retour aux vêtements" },
  "cart.qty": { en: "Qty", fr: "Qté" },
  "cart.each": { en: "each", fr: "chacun" },
  "cart.item": { en: "item", fr: "article" },
  "cart.items": { en: "items", fr: "articles" },
  "cart.invoice": { en: "Order Summary", fr: "Résumé de la commande" },
  "cart.invoice.product": { en: "Product", fr: "Produit" },
  "cart.invoice.details": { en: "Details", fr: "Détails" },
  "cart.invoice.qty": { en: "Qty", fr: "Qté" },
  "cart.invoice.unit": { en: "Unit", fr: "Unit." },
  "cart.invoice.total": { en: "Total", fr: "Total" },
  "cart.invoice.subtotal": { en: "Subtotal", fr: "Sous-total" },
  "cart.invoice.tax": { en: "Tax", fr: "Taxe" },
  "cart.orderdetails": { en: "Order Details", fr: "Détails de la commande" },
  "cart.firstname": { en: "First Name *", fr: "Prénom *" },
  "cart.lastname": { en: "Last Name *", fr: "Nom *" },
  "cart.phone": { en: "Phone Number *", fr: "Téléphone *" },
  "cart.email": { en: "Email *", fr: "Courriel *" },
  "cart.location": { en: "Location *", fr: "Emplacement *" },
  "cart.province": { en: "Province *", fr: "Province *" },
  "cart.po": { en: "PO # *", fr: "N° de bon de commande *" },
  "cart.createorder": { en: "Place Order", fr: "Commander" },
  "cart.continuepayment": { en: "Continue to Payment", fr: "Passer au paiement" },
  // Payment method
  "pay.title": { en: "Payment", fr: "Paiement" },
  "pay.po": { en: "Purchase order / invoice", fr: "Bon de commande / facture" },
  "pay.giftcard": { en: "Gift card", fr: "Carte-cadeau" },
  "pay.giftcard_card": { en: "Gift card + credit card", fr: "Carte-cadeau + carte de crédit" },
  "pay.card": { en: "Credit card", fr: "Carte de crédit" },
  "pay.gift.label": { en: "Gift card code", fr: "Code de carte-cadeau" },
  "pay.gift.placeholder": { en: "e.g. WT-GC-000123", fr: "p. ex. WT-GC-000123" },
  "pay.gift.apply": { en: "Apply", fr: "Appliquer" },
  "pay.gift.checking": { en: "Checking…", fr: "Vérification…" },
  "pay.gift.enter": { en: "Enter a gift card code.", fr: "Entrez un code de carte-cadeau." },
  "pay.gift.check": { en: "Apply your gift card to check its balance first.", fr: "Appliquez d'abord votre carte-cadeau pour vérifier le solde." },
  "pay.gift.invalid": { en: "Gift card not found or inactive.", fr: "Carte-cadeau introuvable ou inactive." },
  "pay.gift.balance": { en: "Gift card balance", fr: "Solde de la carte-cadeau" },
  "pay.gift.applied": { en: "Applied to this order", fr: "Appliqué à cette commande" },
  "pay.gift.balance.due": { en: "Balance due (card)", fr: "Solde dû (carte)" },
  "pay.gift.covered": { en: "Remaining", fr: "Restant" },
  "pay.gift.short": { en: "This gift card doesn't cover the full order — choose \"Gift card + credit card\" to pay the balance.", fr: "Cette carte-cadeau ne couvre pas la totalité — choisissez « Carte-cadeau + carte de crédit » pour payer le solde." },
  "cart.checkout": { en: "Checkout", fr: "Passer à la caisse" },
  "cart.backtocart": { en: "Back to Cart", fr: "Retour au panier" },
  "cart.ordersummary": { en: "Order Summary", fr: "Résumé de la commande" },

  // Cart errors
  "cart.error.both": { en: "Employee number and name are required", fr: "Le numéro d'employé et le nom sont requis" },
  "cart.error.number": { en: "Employee number is required", fr: "Le numéro d'employé est requis" },
  "cart.error.name": { en: "Full name is required", fr: "Le nom complet est requis" },
  "cart.error.required": { en: "Please complete required fields", fr: "Veuillez remplir les champs requis" },
  "cart.error.email": { en: "Please enter a valid email address", fr: "Veuillez entrer une adresse courriel valide" },
  "cart.error.phone": { en: "Please enter a valid phone number", fr: "Veuillez entrer un numéro de téléphone valide" },
  "cart.requiredfields": { en: "* required", fr: "* requis" },

  // Order confirmation
  "order.title": { en: "Order Submitted!", fr: "Commande soumise!" },
  "order.text": {
    en: "Your order has been recorded and sent for processing.",
    fr: "Votre commande a été enregistrée et envoyée pour traitement.",
  },
  "order.continue": { en: "Home", fr: "Accueil" },

  // Categories (used in apparel chips & product cards)
  "cat.Polos": { en: "Polos", fr: "Polos" },
  "cat.T-Shirts": { en: "T-Shirts", fr: "T-Shirts" },
  "cat.Hoodies": { en: "Hoodies", fr: "Kangourous" },
  "cat.Hats": { en: "Headwear", fr: "Couvre-chefs" },
  "cat.CapsBeanies": { en: "Headwear", fr: "Couvre-chefs" },
  "cat.Safety": { en: "Safety", fr: "Sécurité" },
  "cat.Caps": { en: "Headwear", fr: "Couvre-chefs" },
  "cat.Jackets": { en: "Jackets", fr: "Manteaux" },
  "cat.JacketsHoodies": { en: "Jackets & Hoodies", fr: "Manteaux et capuchons" },
  "cat.Work Wear": { en: "Workwear", fr: "Travail" },
  "cat.Flame Resistant": { en: "Flame Resistant", fr: "Vêtements ignifuges" },
  "cat.Shirts": { en: "T-Shirts", fr: "T-shirts" },
  "cat.Sweaters": { en: "Sweaters", fr: "Chandails" },
  "cat.Footwear": { en: "Safety Footwear", fr: "Chaussures de sécurité" },
  "cat.Headwear": { en: "Headwear", fr: "Couvre-chefs" },
  "cat.Pants": { en: "Pants", fr: "Pantalons" },
  "cat.Safety Vests": { en: "Safety Vests", fr: "Gilets de sécurité" },
  "cat.Safety Shirts": { en: "Safety Shirts", fr: "Chemises de sécurité" },
  "cat.Safety Hoodies": { en: "Safety Hoodies", fr: "Kangourous de sécurité" },
  "cat.Safety Jackets": { en: "Safety Jackets", fr: "Manteaux de sécurité" },
  "cat.Safety Shoes": { en: "Safety Shoes", fr: "Chaussures de sécurité" },
  "cat.Safety Boots": { en: "Safety Boots", fr: "Bottes de sécurité" },
  "cat.SWAG": { en: "Accessories", fr: "Accessoires" },
  "cat.Swag": { en: "Accessories", fr: "Accessoires" },
  "cat.New Hire Kit": { en: "Office Kit", fr: "Trousse bureau" },
  "nav.newhirekit": { en: "Office Kit", fr: "Trousse bureau" },

  // Product detail
  "product.taptoclose": { en: "Tap anywhere to close", fr: "Appuyez pour fermer" },
  "product.related": { en: "Related Items", fr: "Articles connexes" },
  "product.more": { en: "More", fr: "Plus de" },
  "product.notfound": { en: "Product not found.", fr: "Produit introuvable." },
  "product.waist": { en: "Waist", fr: "Tour de taille" },
  "product.length": { en: "Length", fr: "Longueur" },
  "product.variant": { en: "Variant", fr: "Variante" },
  "product.select": { en: "Select", fr: "Choisir" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
  return translations[key]?.[locale] ?? translations[key]?.en ?? key;
}
