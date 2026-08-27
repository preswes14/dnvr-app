<?php
/**
 * DNVR App — membership bridge (≈10 lines of logic).
 *
 * WHAT IT DOES: lets the app, when it is served from this same domain
 * (e.g. thednvr.com/app/), recognize a reader's EXISTING website login —
 * so Diehards never sign in inside the app at all. The endpoint is
 * read-only: it reports whether the current browser session is logged in,
 * and if so hands back the standard WordPress REST nonce plus the
 * display name. It grants nothing a logged-in page load doesn't already
 * have, and reveals nothing to logged-out visitors.
 *
 * HOW TO INSTALL (either option):
 *  - Paste everything below the header into your theme's functions.php, or
 *  - Drop this whole file into wp-content/mu-plugins/ (create the folder
 *    if it doesn't exist) — it activates automatically, survives theme
 *    changes, and is the cleaner option.
 *
 * The app calls: /wp-admin/admin-ajax.php?action=dnvr_app_nonce
 */

add_action( 'wp_ajax_dnvr_app_nonce', 'dnvr_app_nonce' );
add_action( 'wp_ajax_nopriv_dnvr_app_nonce', 'dnvr_app_nonce' );

function dnvr_app_nonce() {
	if ( is_user_logged_in() ) {
		$user = wp_get_current_user();
		wp_send_json( array(
			'ok'    => true,
			'nonce' => wp_create_nonce( 'wp_rest' ),
			'name'  => $user->display_name,
		) );
	}
	wp_send_json( array( 'ok' => false ) );
}
