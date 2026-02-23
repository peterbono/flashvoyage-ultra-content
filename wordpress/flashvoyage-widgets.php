<?php
/**
 * Plugin Name: FlashVoyage Travelpayouts Widgets
 * Description: Renders Travelpayouts affiliate widgets via [fv_widget] shortcode. Auto-activates as mu-plugin.
 * Version: 1.0.0
 * Author: FlashVoyage
 *
 * Deploy: copy this file to wp-content/mu-plugins/flashvoyage-widgets.php
 * It auto-activates — no manual activation required.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * [fv_widget] shortcode handler.
 *
 * Attributes:
 *   type        — flights | esim | insurance | insurance_usa | insurance_schengen
 *                  flights_calendar | flights_popular | flights_map
 *                  transfers | tours | car_rental | bikes | flight_compensation | events
 *   origin      — IATA code (flights only), default PAR
 *   destination — IATA code (flights only), default BKK
 *
 * Partner params (hardcoded, never exposed in post content):
 *   trs      = 463418
 *   shmarker = 676421
 */
function fv_widget_shortcode( $atts ) {
    $a = shortcode_atts( array(
        'type'        => '',
        'origin'      => 'PAR',
        'destination' => 'BKK',
    ), $atts, 'fv_widget' );

    $type        = sanitize_text_field( $a['type'] );
    $origin      = strtoupper( sanitize_text_field( $a['origin'] ) );
    $destination = strtoupper( sanitize_text_field( $a['destination'] ) );

    // Partner constants
    $trs      = '463418';
    $shmarker = '676421';

    $script = '';

    switch ( $type ) {

        // --- Aviasales Flight Search Form (promo_id=7879, campaign_id=100) ---
        case 'flights':
            $script = '<script async src="https://trpwdg.com/content?currency=eur&trs=' . $trs . '&shmarker=' . $shmarker . '&show_hotels=true&powered_by=true&locale=fr&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2332a8dd&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=0&plain=false&promo_id=7879&campaign_id=100" charset="utf-8"></script>';
            break;

        // --- Airalo eSIM Search Form (promo_id=8588, campaign_id=541) ---
        case 'esim':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&locale=en&powered_by=true&color_button=%2332a8dd&color_focused=%2332a8dd&secondary=%23FFFFFF&dark=%23262626&light=%23FFFFFF&special=%23C4C4C4&border_radius=0&plain=false&no_labels=true&promo_id=8588&campaign_id=541" charset="utf-8"></script>';
            break;

        // --- VisitorCoverage Travel Medical (promo_id=4652, campaign_id=153) ---
        case 'insurance':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&type=visitor&theme=small-theme1&powered_by=true&campaign_id=153&promo_id=4652" charset="utf-8"></script>';
            break;

        // --- Insubuy Insurance USA Horizontal (promo_id=4792, campaign_id=165) ---
        case 'insurance_usa':
            $script = '<iframe src="https://tp.media/content?campaign_id=165&promo_id=4792&shmarker=' . $shmarker . '&trs=' . $trs . '&widget=670x119" width="670" height="119" frameborder="0" style="max-width:100%;"></iframe>';
            break;

        // --- Aviasales Pricing Calendar (promo_id=4041, campaign_id=100) ---
        case 'flights_calendar':
            $script = '<script async src="https://trpwdg.com/content?currency=eur&trs=' . $trs . '&shmarker=' . $shmarker . '&searchUrl=www.aviasales.com%2Fsearch&locale=fr&powered_by=true&one_way=false&only_direct=false&period=year&range=7%2C14&primary=%230C73FE&color_background=%23ffffff&dark=%23000000&light=%23FFFFFF&achieve=%2345AD35&promo_id=4041&campaign_id=100" charset="utf-8"></script>';
            break;

        // --- Aviasales Popular Routes (promo_id=4044, campaign_id=100) ---
        case 'flights_popular':
            $script = '<script async src="https://trpwdg.com/content?currency=eur&trs=' . $trs . '&shmarker=' . $shmarker . '&target_host=www.aviasales.com%2Fsearch&locale=fr&limit=6&powered_by=true&primary=%230085FF&promo_id=4044&campaign_id=100" charset="utf-8"></script>';
            break;

        // --- Aviasales Prices on Map (promo_id=4054, campaign_id=100) ---
        case 'flights_map':
            $script = '<script async src="https://trpwdg.com/content?currency=eur&trs=' . $trs . '&shmarker=' . $shmarker . '&lat=51.51&lng=0.06&powered_by=true&search_host=www.aviasales.com%2Fsearch&locale=en&origin=' . esc_attr( $origin ) . '&value_min=0&value_max=1000000&round_trip=true&only_direct=false&radius=1&draggable=true&disable_zoom=false&show_logo=false&scrollwheel=false&primary=%233FABDB&secondary=%233FABDB&light=%23ffffff&width=1500&height=500&zoom=2&promo_id=4054&campaign_id=100" charset="utf-8"></script>';
            break;

        // --- Insubuy Schengen Visa Insurance (promo_id=4797, campaign_id=111) ---
        // TravelPayouts returns text/html (not JS) for this promo — must use iframe
        case 'insurance_schengen':
            $script = '<iframe src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&locale=fr&promo_id=4797&campaign_id=111" width="100%" height="320" frameborder="0" style="max-width:100%;"></iframe>';
            break;

        // --- Kiwitaxi Shuttles Search Form (promo_id=2949, campaign_id=111) ---
        case 'transfers':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&locale=fr&promo_id=2949&campaign_id=111" charset="utf-8"></script>';
            break;

        // --- Tiqets Popular Tours Widget (promo_id=3947, campaign_id=111) ---
        // Tiqets widget uses 'locale' as city_id — use 'language' for i18n instead
        case 'tours':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&language=fr&promo_id=3947&campaign_id=111" charset="utf-8"></script>';
            break;

        // --- Economybookings Rental Cars Search Form (promo_id=4480, campaign_id=111) ---
        case 'car_rental':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&locale=fr&promo_id=4480&campaign_id=111" charset="utf-8"></script>';
            break;

        // --- BikesBooking Rental Bikes Search Form (promo_id=5472, campaign_id=111) ---
        case 'bikes':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&locale=fr&promo_id=5472&campaign_id=111" charset="utf-8"></script>';
            break;

        // --- AirHelp Flight Compensation Search Form (promo_id=8679, campaign_id=111) ---
        case 'flight_compensation':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&locale=fr&promo_id=8679&campaign_id=111" charset="utf-8"></script>';
            break;

        // --- TicketNetwork Events Schedule (promo_id=6086, campaign_id=111) ---
        case 'events':
            $script = '<script async src="https://trpwdg.com/content?trs=' . $trs . '&shmarker=' . $shmarker . '&powered_by=true&locale=fr&promo_id=6086&campaign_id=111" charset="utf-8"></script>';
            break;

        default:
            return '<!-- fv_widget: unknown type "' . esc_html( $type ) . '" -->';
    }

    return '<div class="fv-tp-widget" data-widget-type="' . esc_attr( $type ) . '">' . $script . '</div>';
}
add_shortcode( 'fv_widget', 'fv_widget_shortcode' );

/**
 * Prevent wptexturize from converting straight quotes to smart quotes
 * inside [fv_widget] shortcodes — this breaks attribute parsing.
 */
add_filter( 'no_texturize_shortcodes', function ( $shortcodes ) {
    $shortcodes[] = 'fv_widget';
    return $shortcodes;
} );

/**
 * Register fv_schema_json custom field so it can be set via the REST API.
 */
add_action( 'init', function () {
    register_post_meta( 'post', 'fv_schema_json', array(
        'show_in_rest'  => true,
        'single'        => true,
        'type'          => 'string',
        'auth_callback' => function () { return current_user_can( 'edit_posts' ); },
    ) );
} );

/**
 * Inject JSON-LD schemas stored in fv_schema_json post meta into <head>.
 */
add_action( 'wp_head', function () {
    if ( ! is_singular( 'post' ) ) {
        return;
    }
    $raw = get_post_meta( get_the_ID(), 'fv_schema_json', true );
    if ( empty( $raw ) ) {
        return;
    }
    $schemas = json_decode( $raw, true );
    if ( ! is_array( $schemas ) ) {
        return;
    }
    foreach ( $schemas as $schema ) {
        echo '<script type="application/ld+json">' . wp_json_encode( $schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";
    }
}, 1 );

