package com.nimbus.api.identity.internal;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface VerificationCodeRepository extends JpaRepository<VerificationCode, UUID> {

	/** The User's code, locked until the transaction ends, so parallel tries are counted one after the other. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from VerificationCode c where c.userId = :userId")
	Optional<VerificationCode> findLockedByUserId(@Param("userId") UUID userId);

}
