package com.nimbus.api;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

class ModularityTests {

	ApplicationModules modules = ApplicationModules.of(ApiApplication.class);

	// Fails on module cycles or when a module uses another module's internal types.
	@Test
	void verifiesModularStructure() {
		modules.verify();
	}

	// Writes module diagrams and canvases to build/spring-modulith-docs.
	@Test
	void writesDocumentation() {
		new Documenter(modules)
			.writeModulesAsPlantUml()
			.writeIndividualModulesAsPlantUml()
			.writeModuleCanvases();
	}

}
