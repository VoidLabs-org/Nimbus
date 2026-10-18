package com.nimbus.api.identity.internal;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface EmailedCodeRepository extends JpaRepository<EmailedCode, EmailedCode.Key> {

	/** The User's code of this kind, locked until the transaction ends, so parallel tries are counted one after the other. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from EmailedCode c where c.id.userId = :userId and c.id.kind = :kind")
	Optional<EmailedCode> findLocked(@Param("userId") UUID userId, @Param("kind") EmailedCodes.Kind kind);

}
