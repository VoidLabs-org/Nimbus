plugins {
	java
	id("org.springframework.boot") version "4.1.1"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "com.nimbus"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(21)
	}
}

repositories {
	mavenCentral()
}

extra["springModulithVersion"] = "2.1.1"

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-actuator")
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.springframework.boot:spring-boot-starter-security")
	implementation("org.springframework.boot:spring-boot-starter-security-oauth2-client")
	implementation("org.springframework.boot:spring-boot-starter-security-oauth2-resource-server")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("org.flywaydb:flyway-database-postgresql")
	// Argon2id password hashing (Spring Security's Argon2PasswordEncoder needs it).
	implementation("org.bouncycastle:bcprov-jdk18on:1.83")
	implementation("com.github.ua-parser:uap-java:1.6.1")
	// The storage module talks to Cloudflare R2 (MinIO locally and in tests) through the S3 API.
	implementation(platform("software.amazon.awssdk:bom:2.57.3"))
	implementation("software.amazon.awssdk:s3") {
		// Its default HTTP clients. Apache HttpClient 5 on the classpath would also become Spring's default for
		// RestClient and the test client, and it waits out a 429's Retry-After by itself. The JDK's client instead.
		exclude(group = "software.amazon.awssdk", module = "apache5-client")
		exclude(group = "software.amazon.awssdk", module = "apache-client")
		exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
	}
	implementation("software.amazon.awssdk:url-connection-client")
	// Lets ImageIO read WebP uploads; JPEG and PNG are built in.
	implementation("com.twelvemonkeys.imageio:imageio-webp:3.15.3")
	implementation("org.springframework.modulith:spring-modulith-observability-api")
	implementation("org.springframework.modulith:spring-modulith-starter-core")
	implementation("org.springframework.modulith:spring-modulith-starter-jpa")
	// Restarts the app when classes change under `bootRun`; not in the deployed jar. See `pnpm --filter api dev:watch`.
	developmentOnly("org.springframework.boot:spring-boot-devtools")
	runtimeOnly("org.postgresql:postgresql")
	runtimeOnly("org.springframework.modulith:spring-modulith-actuator")
	runtimeOnly("org.springframework.modulith:spring-modulith-observability-core")
	runtimeOnly("org.springframework.modulith:spring-modulith-runtime")
	testImplementation("org.springframework.boot:spring-boot-starter-actuator-test")
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
	testImplementation("org.springframework.boot:spring-boot-starter-security-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testImplementation("org.springframework.boot:spring-boot-resttestclient")
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.springframework.modulith:spring-modulith-starter-test")
	testImplementation("org.testcontainers:testcontainers-junit-jupiter")
	testImplementation("org.testcontainers:testcontainers-minio")
	testImplementation("org.testcontainers:testcontainers-postgresql")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

dependencyManagement {
	imports {
		mavenBom("org.springframework.modulith:spring-modulith-bom:${property("springModulithVersion")}")	}
}

tasks.withType<Test> {
	useJUnitPlatform()
}
