/* =====================================================================
   Aroma Café · La carte
   Une catégorie = { id, g, t, m, items, ... }
     id     : identifiant utilisé dans l'adresse (#cafe-glace)
     g      : groupe, "Boissons" ou "Cuisine" (Cuisine = fond ardoise)
     t      : titre affiché
     m      : modèle 3D à afficher (voir scene3d.js)
     items  : les produits, écrits avec P(nom, prix, précision facultative)
     note   : (facultatif) texte rouge sous le titre
     extras : (facultatif) encadrés de suppléments
     chips  : (facultatif) liste de pastilles, ex. saveurs boba
   Pour changer un prix : modifier le nombre, enregistrer, recharger la page.
   ===================================================================== */

// Raccourci : P("Café latte", 3000) donne { n: "Café latte", p: 3000, s: undefined }
const P = (n, p, s) => ({ n, p, s });

const MENU=[
 {id:"cafe-chaud",g:"Boissons",t:"Café chaud",m:"cup",items:[
  P("Café latte",3000),P("Café latte vanille",3500),P("Café cappuccino",3500),P("Café latte caramel",3500),P("Café latte noisette",3500),
  P("Café mocha",3500),P("Café mocha blanc",3500),P("Café libanais",2000),P("Latte matcha",3500),P("Chocolat chaud",2500),P("Thé composé",1500),
  P("Thé chaud",1000),P("Café espresso",1000),P("Café espresso double",1500),P("Café machiato",2000),P("Café cortado",2500),
  P("Café américain",2500),P("Café americano chaud",2000),P("Cappuccino",3000)],
  extras:[{t:"Suppléments",items:[P("Lait d'amande / lait de coco",500)]}]},
 {id:"cafe-glace",g:"Boissons",t:"Café glacé",m:"icedLatte",items:[
  P("Café latte glacé",3000),P("Café latte caramel glacé",3500),P("Café latte noisette glacé",3500),P("Café latte cappuccino glacé",3500),
  P("Café latte vanille glacé",3500),P("Café caramel salé glacé",3500),P("Café latte Oreo glacé",3500),P("Café latte Lotus glacé",3500),
  P("Café latte Nutella glacé",3500),P("Café latte cookies glacé",3500),P("Café matcha glacé",3500),P("Café mocha glacé",3500),
  P("Café mocha blanc glacé",3500),P("Café américain glacé",2500),P("Café americano glacé",2000),P("Café latte cannelle glacé",3500),P("Latte matcha glacé",3500)]},
 {id:"mocha-frappe",g:"Boissons",t:"Mocha frappé",m:"mocha",items:[
  P("Mocha frappé",3500),P("Mocha frappé blanc",3500),P("Mocha frappé chocolat",3500),P("Mocha frappé caramel",4000),P("Mocha frappé Nutella",4000),
  P("Mocha frappé Twix",4000),P("Mocha frappé Snickers",4000),P("Mocha frappé KitKat",4000),P("Mocha frappé Lotus",4000),P("Mocha frappé Oreo",4000),
  P("Mocha frappé cookies",4000),P("Mocha frappé espresso",4000)]},
 {id:"milk-shake",g:"Boissons",t:"Milk shake",m:"shake",items:[
  P("Milk shake vanille",3000),P("Milk shake chocolat",3500),P("Milk shake mangue",3500),P("Milk shake papaya",3500),P("Milk shake caramel",3500),
  P("Milk shake Oreo",3500),P("Milk shake Nutella",3500),P("Milk shake KitKat",3500),P("Milk shake Lotus",3500),P("Milk shake fraise",3500),
  P("Milk shake framboise",3500),P("Milk shake fruit rouge",3500),P("Milk shake myrtille",3500),P("Milk shake Snickers",3500),
  P("Milk shake beurre d'arachide",3500),P("Milk shake matcha",4000),P("Milk shake dragon",3500)]},
 {id:"bubble-tea",g:"Boissons",t:"Bubble Tea",m:"boba",items:[
  P("Thé au lait",2500),P("Thé au lait bubble caramel",3000),P("Thé au lait bubble chocolat",3000),P("Thé au lait bubble vanille",3000),
  P("Thé au lait bubble fraise",3000),P("Thé au lait bubble framboise",3000),P("Thé au lait bubble myrtille",3000),P("Thé bubble passion",3000),
  P("Thé bubble citron",3000),P("Thé bubble fruit du dragon",3000),P("Thé bubble mangue / passion",3000),P("Thé bubble menthe / passion",3000),
  P("Thé au lait bubble matcha",4000)]},
 {id:"aroma-speciale",g:"Boissons",t:"Aroma Spéciale",m:"brand",note:"Vous pouvez ajouter la saveur boba de votre choix aux différentes boissons.",items:[
  P("Aroma yaourt mangue",4000),P("Aroma dalgona café",4000),P("Aroma smoothie mangue dragon",4000),P("Aroma smoothie mangue framboise",4000),
  P("Aroma smoothie mangue fraise",4000),P("Aroma smoothie mangue orange",4000),P("Aroma brownie blendé",4000),P("Aroma choco-noir menthe blendé",4000),
  P("Salade de fruit",2500),P("Aroma salade fruit",3000),P("Aroma piña colada",4000),P("Aroma choco-banane",4000),P("Aroma Red Bull",4000),
  P("Aroma choco blanc fraise",4000),P("Aroma limonade passion",3500),P("Aroma choco noir framboise blendé",4000),
  P("Aroma choco noir orange blendé",4000),P("Aroma ananas-passion",4000),P("Aroma ananas passion menthe",4000)],
  chips:{t:"Saveurs boba",list:["Framboise","Pêche","Chocolat","Passion","Fraise","Pomme","Mangue","Fruit du dragon","Kiwi","Raisin","Litchi","Myrtille"]}},
 {id:"smoothie",g:"Boissons",t:"Smoothie",m:"smoothie",items:[
  P("Smoothie mangue",2500),P("Smoothie papaya",2500),P("Smoothie ananas",2500),P("Smoothie pastèque",2500),P("Smoothie passion",3000),
  P("Smoothie mojito",3000),P("Smoothie mangue / passion",3000),P("Smoothie mangue / passion / menthe",3000),P("Smoothie fraise",3000),
  P("Smoothie framboise",3000),P("Smoothie fruit rouge",3000),P("Smoothie myrtille",3000)]},
 {id:"jus-naturels",g:"Boissons",t:"Jus naturels",m:"juice",items:[
  P("Jus orange",2000),P("Jus mangue",2000),P("Jus ananas",2000),P("Jus goyave",2000),P("Jus de baobab",2000),P("Jus bissap",2000),
  P("Jus corossol",2500),P("Jus clémentine",2500),P("Jus passion",2500),P("Jus orange / ananas",2000),P("Jus passion / ananas",2500),
  P("Jus passion / orange",2500),P("Jus bissap / ananas / menthe",2000),P("Jus bissap / citron / menthe",2000),P("Jus ananas / gingembre",2000),
  P("Jus bissap / ananas / gingembre",2000),P("Jus ananas / orange / gingembre / menthe",2000)]},
 {id:"the-glace",g:"Boissons",t:"Thé glacé",m:"icedTea",items:[
  P("Thé glacé pêche",2500),P("Thé glacé citron",2500),P("Thé glacé fraise",2500),P("Thé glacé myrtille",2500),P("Thé glacé framboise",2500),
  P("Thé glacé citron / menthe",2500),P("Thé glacé citron / passion",2500),P("Thé glacé mangue / passion",2500),P("Thé glacé menthe / passion",2500),P("Thé glacé passion",2500)]},
 {id:"cocktail-gazeux",g:"Boissons",t:"Cocktail gazeux",m:"soda",items:[
  P("Sprite + passion",2000),P("Sprite + passion + fraise",2000),P("Sprite + passion + citron",2000),P("Sprite + chewing-gum",2000),
  P("Sprite + fraise",2000),P("Sprite + myrtille",2000),P("Sprite + fruit rouge",2000),P("Sprite + framboise",2000)]},
 {id:"sucrerie",g:"Boissons",t:"Sucrerie",m:"can",items:[
  P("Coca",1000),P("Fanta",1000),P("Malta",1000),P("Sprite",1000),P("Cocktail",1000),P("Red Bull",2000),P("Eau gazeuse",1500),P("Eau minérale 0,5 L / 1,5 L","500 / 1 500 F")]},
 {id:"glace",g:"Boissons",t:"Glace",m:"iceCream",items:[P("Chocolat",2000),P("Vanille",2000),P("Chocolat vanille",2000)],
  extras:[{t:"Supplément sauce",items:[P("Sauce framboise",1000),P("Sauce fraise",1000),P("Sauce myrtille",1000),P("Sauce chocolat noir",1000),P("Sauce caramel",1000)]}]},
 {id:"petit-dejeuner",g:"Cuisine",t:"Petit déjeuner",m:"brand",items:[
  P("Croque monsieur",1500),P("Croque madame",2000),P("Pancake",3000),P("Pancake chocolat",3500),P("Omelette JF avec pain",3500),
  P("Omelette avec pain",2500),P("Œuf au plat",2500),P("Œuf poché",2500),P("Sandwich jambon",3000),P("Croissant",1000),P("Pain raisin",1500),P("Pain chocolat",1500)]},
 {id:"fastfood",g:"Cuisine",t:"Fastfood",m:"burger",items:[
  P("Burger bœuf",3000,"Frites + salade de chou"),P("Cheeseburger",3500),P("Burger œuf",3500,"Frites + salade de chou"),
  P("Burger œuf + fromage",4000,"Frites + salade de chou"),P("Burger royale",4500,"Frites + salade de chou"),P("Chicken burger",3500,"Frites + salade de chou"),
  P("Cheese chicken burger",4000,"Frites + salade de chou"),P("Fahita",3500,"Frites"),P("Arabica",3500,"Frites")]},
 {id:"sandwich",g:"Cuisine",t:"Sandwich",m:"brand",items:[
  P("Shawarma viande",2500),P("Shawarma poulet",2500),P("Philadelphia",3500),P("Sandwich saucisse",2500),P("Sandwich viande hachée",2500),
  P("Sandwich crispy",3500,"Crème ail"),P("Sandwich escalope",3500,"Fromage cheddar")]},
 {id:"entree",g:"Cuisine",t:"Entrée",m:"brand",items:[P("Salade César",3000),P("Salade verte",2500),P("Saucisse sautée",2000)]},
 {id:"plat",g:"Cuisine",t:"Plat",m:"brand",items:[
  P("Plat crispy",4500,"Riz jaune / fried rice"),P("Plat escalope",4500,"Frites / riz jaune"),P("Boulette de bœuf",5000,"Frites / pommes sautées"),
  P("Mozzarella sticks",3000),P("Corn dog",3000),P("Spaghetti bolognaise",3500),P("Spaghetti fettuccine",4000)]},
 {id:"crepes-gaufres",g:"Cuisine",t:"Crêpes & gaufres",m:"waffle",items:[
  P("Crêpe chocolat",3000),P("Crêpe Nutella",3500),P("Crêpe Oreo",3500),P("Crêpe brownie",3500),P("Crêpe cookies",3500),P("Crêpe 3 chocolats",4000),
  P("Crêpe fettuccine chocolat",4500),P("Crêpe fettuccine Nutella",4500),P("Crêpe fettuccine Oreo",4500),P("Crêpe fettuccine brownie",4500),
  P("Crêpe fettuccine cookies",4500),P("Gaufre chocolat",3500),P("Gaufre Nutella",4000),P("Gaufre brownie",4500),P("Gaufre Oreo",4000),
  P("Gaufre cookies",4500),P("Gaufre 3 chocolats",4500)],extras:[{t:"Supplément",items:[P("Scoop de glace",1000)]}]},
 {id:"patisseries",g:"Cuisine",t:"Pâtisseries",m:"croissant",items:[
  P("Fondant chocolat",3000),P("Brownie chocolat",2500),P("Cookies",1500),P("Éclair",2500),P("Gâteau",2500),P("Muffin au chocolat",2500),
  P("Muffin double chocolat",2500),P("Cheesecake fraise",3000),P("Cheesecake framboise",3000),P("Cheesecake fruit rouge",3000),
  P("Cheesecake myrtille",3000),P("Cheesecake Lotus",3500),P("Cheesecake Oreo",3500),P("Tiramisu",3000),P("Red velvet",2500)],
  extras:[{t:"Suppléments",items:[P("Sauce chocolat",1000)]}]}
];