# =====================================================================
#  Aroma Café · recette de construction pour Render
#  Étape 1 : on compile l'application avec Maven (Java 21 complet).
#  Étape 2 : on ne garde que le fichier .jar, dans une image légère (Java 21 sans outils de compilation).
# =====================================================================

# ---------- 1. Construction ----------
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# Le backend ET le menu : Maven copie ../menu dans le site servi par Spring
COPY backend backend
COPY menu menu

# mvnw écrit sous Windows peut avoir des fins de ligne « \r\n » que Linux refuse : on les nettoie
RUN sed -i 's/\r$//' backend/mvnw && chmod +x backend/mvnw
RUN cd backend && ./mvnw -B -DskipTests package

# ---------- 2. Exécution ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/backend/target/*.jar app.jar

# L'offre gratuite de Render n'a que 512 Mo de mémoire : on règle Java pour qu'il tienne dedans
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k"

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]