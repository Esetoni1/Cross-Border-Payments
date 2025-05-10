;; Update the timestamp (in a real contract, this would come from the blockchain)
;; For testing purposes, this function allows setting the timestamp manually
(define-public (update-timestamp (new-timestamp uint))
    (begin
        (asserts! (is-owner) (err err-owner-only))
        (var-set current-timestamp new-timestamp)
        (ok true)
    )
);; Cross-Border Payment System
;; This contract enables cross-border payments between different currencies
;; with exchange rate feeds, fee structures, and compliance checks

;; Define constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-invalid-amount (err u101))
(define-constant err-insufficient-balance (err u102))
(define-constant err-invalid-recipient (err u103))
(define-constant err-country-not-supported (err u104))
(define-constant err-compliance-check-failed (err u105))
(define-constant err-currency-not-supported (err u106))
(define-constant err-exchange-rate-unavailable (err u107))

;; Data maps
(define-map user-balances 
    { user: principal, currency: (string-ascii 3) }
    { balance: uint }
)

(define-map exchange-rates 
    { from-currency: (string-ascii 3), to-currency: (string-ascii 3) }
    { rate: uint, decimals: uint, last-updated: uint }
)

(define-map supported-currencies 
    { currency: (string-ascii 3) }
    { supported: bool, decimals: uint }
)

(define-map supported-countries 
    { country-code: (string-ascii 2) }
    { supported: bool }
)

(define-map transaction-history
    { tx-id: uint }
    {
        sender: principal,
        recipient: principal,
        amount: uint,
        from-currency: (string-ascii 3),
        to-currency: (string-ascii 3),
        exchange-rate: uint,
        fee: uint,
        timestamp: uint,
        status: (string-ascii 10)
    }
)

;; Variables
(define-data-var tx-counter uint u0)
(define-data-var fee-percentage uint u250) ;; 2.5% with 2 decimals of precision
(define-data-var current-timestamp uint u0)

;; Private functions
(define-private (is-owner)
    (is-eq tx-sender contract-owner)
)

(define-private (is-currency-supported (currency (string-ascii 3)))
    (default-to false (get supported (map-get? supported-currencies { currency: currency })))
)

(define-private (is-country-supported (country-code (string-ascii 2)))
    (default-to false (get supported (map-get? supported-countries { country-code: country-code })))
)

(define-private (get-user-balance (user principal) (currency (string-ascii 3)))
    (default-to u0 (get balance (map-get? user-balances { user: user, currency: currency })))
)

(define-private (set-user-balance (user principal) (currency (string-ascii 3)) (new-balance uint))
    (map-set user-balances 
        { user: user, currency: currency }
        { balance: new-balance }
    )
)

(define-private (calculate-fee (amount uint))
    (/ (* amount (var-get fee-percentage)) u10000)
)

(define-private (convert-amount (amount uint) (from-currency (string-ascii 3)) (to-currency (string-ascii 3)))
    (let ((exchange-rate-data (map-get? exchange-rates { from-currency: from-currency, to-currency: to-currency })))
        (if (is-some exchange-rate-data)
            (let ((rate (get rate (unwrap-panic exchange-rate-data)))
                  (decimals (get decimals (unwrap-panic exchange-rate-data))))
                ;; Convert the amount using the exchange rate
                (ok (/ (* amount rate) (pow u10 decimals)))
            )
            (err err-exchange-rate-unavailable)
        )
    )
)

(define-private (get-next-tx-id)
    (let ((current-tx-id (var-get tx-counter)))
        (var-set tx-counter (+ current-tx-id u1))
        current-tx-id
    )
)
(define-private (record-transaction 
    (sender principal) 
    (recipient principal) 
    (amount uint) 
    (from-currency (string-ascii 3)) 
    (to-currency (string-ascii 3))
    (exchange-rate uint)
    (fee uint)
    (status (string-ascii 10))
)
    (let ((tx-id (get-next-tx-id)))
        (map-set transaction-history
            { tx-id: tx-id }
            {
                sender: sender,
                recipient: recipient,
                amount: amount,
                from-currency: from-currency,
                to-currency: to-currency,
                exchange-rate: exchange-rate,
                fee: fee,
                timestamp: (var-get current-timestamp),
                status: status
            }
        )
        tx-id
    )
)
;; Check if the transfer passes compliance checks
;; This is a simplified version - in a real-world scenario, this would call external oracles
;; or use more sophisticated compliance logic
(define-private (check-compliance 
    (sender principal) 
    (recipient principal) 
    (amount uint) 
    (from-currency (string-ascii 3)) 
    (to-currency (string-ascii 3))
    (sender-country (string-ascii 2))
    (recipient-country (string-ascii 2))
)
    (and 
        (is-country-supported sender-country)
        (is-country-supported recipient-country)
        (is-currency-supported from-currency)
        (is-currency-supported to-currency)
        ;; Add more compliance checks as needed
        true
    )
)

;; Public functions
;; Add funds to a user's balance
(define-public (deposit (currency (string-ascii 3)) (amount uint))
    (begin
        (asserts! (> amount u0) (err err-invalid-amount))
        (asserts! (is-currency-supported currency) (err err-currency-not-supported))
        
        ;; In a real implementation, this would involve a token transfer
        ;; For simplicity, we're just updating balances directly
        (let ((current-balance (get-user-balance tx-sender currency)))
            (set-user-balance tx-sender currency (+ current-balance amount))
            (ok amount)
        )
    )
)

;; Execute a cross-border payment
(define-public (send-payment 
    (recipient principal) 
    (amount uint) 
    (from-currency (string-ascii 3)) 
    (to-currency (string-ascii 3))
    (sender-country (string-ascii 2))
    (recipient-country (string-ascii 2))
)
    (let (
        (sender-balance (get-user-balance tx-sender from-currency))
        (fee (calculate-fee amount))
        (total-amount (+ amount fee))
    )
        ;; Validate inputs
        (asserts! (> amount u0) (err err-invalid-amount))
        (asserts! (>= sender-balance total-amount) (err err-insufficient-balance))
        (asserts! (not (is-eq tx-sender recipient)) (err err-invalid-recipient))
        
        ;; Check compliance
        (asserts! (check-compliance tx-sender recipient amount from-currency to-currency sender-country recipient-country)
            (err err-compliance-check-failed))
        ;; Convert the amount to the target currency
        (match (convert-amount amount from-currency to-currency)
            converted-amount
            ;; Execute the transfer
            (begin
                ;; Deduct from sender
                (set-user-balance tx-sender from-currency (- sender-balance total-amount))
                
                ;; Add to recipient
                (let ((recipient-balance (get-user-balance recipient to-currency)))
                    (set-user-balance recipient to-currency (+ recipient-balance converted-amount))
                )
                
                ;; Record the transaction
                (let ((exchange-info (default-to 
                        { rate: u0, decimals: u0, last-updated: u0 }
                        (map-get? exchange-rates { from-currency: from-currency, to-currency: to-currency })))
                     )
                    (ok (record-transaction 
                        tx-sender 
                        recipient 
                        amount 
                        from-currency 
                        to-currency
                        (get rate exchange-info)
                        fee
                        "completed"
                    ))
                )
            )
            error (err error)
        )
    )
)
;; Administrative functions - only callable by contract owner
(define-public (set-exchange-rate (from-currency (string-ascii 3)) (to-currency (string-ascii 3)) (rate uint) (decimals uint))
    (begin
        (asserts! (is-owner) (err err-owner-only))
        (map-set exchange-rates
            { from-currency: from-currency, to-currency: to-currency }
            { rate: rate, decimals: decimals, last-updated: (var-get current-timestamp) }
        )
        (ok true)
    )
)

(define-public (add-supported-currency (currency (string-ascii 3)) (decimals uint))
    (begin
        (asserts! (is-owner) (err err-owner-only))
        (map-set supported-currencies
            { currency: currency }
            { supported: true, decimals: decimals }
        )
        (ok true)
    )
)

(define-public (add-supported-country (country-code (string-ascii 2)))
    (begin
        (asserts! (is-owner) (err err-owner-only))
        (map-set supported-countries
            { country-code: country-code }
            { supported: true }
        )
        (ok true)
    )
)

(define-public (set-fee-percentage (new-fee-percentage uint))
    (begin
        (asserts! (is-owner) (err err-owner-only))
        (asserts! (<= new-fee-percentage u1000) (err err-invalid-amount)) ;; Max fee of 10%
        (var-set fee-percentage new-fee-percentage)
        (ok true)
    )
)

;; Read-only functions
(define-read-only (get-transaction (tx-id uint))
    (map-get? transaction-history { tx-id: tx-id })
)

(define-read-only (get-current-exchange-rate (from-currency (string-ascii 3)) (to-currency (string-ascii 3)))
    (map-get? exchange-rates { from-currency: from-currency, to-currency: to-currency })
)

(define-read-only (get-current-fee-percentage)
    (var-get fee-percentage)
)

(define-read-only (check-currency-support (currency (string-ascii 3)))
    (map-get? supported-currencies { currency: currency })
)

(define-read-only (check-country-support (country-code (string-ascii 2)))
    (map-get? supported-countries { country-code: country-code })
)

(define-read-only (get-balance (user principal) (currency (string-ascii 3)))
    (get-user-balance user currency)
)