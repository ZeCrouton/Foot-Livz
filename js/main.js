document.addEventListener('DOMContentLoaded', function () {
    // Défilement fluide uniquement pour les ancres internes (#section)
    document.querySelectorAll('nav ul li a[href^="#"]').forEach(function (link) {
        link.addEventListener('click', function (event) {
            const targetSection = document.getElementById(this.getAttribute('href').substring(1));
            if (targetSection) {
                event.preventDefault();
                window.scrollTo({ top: targetSection.offsetTop, behavior: 'smooth' });
            }
        });
    });

    // Marque le lien correspondant à la page courante
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav ul li a').forEach(function (link) {
        const linkPage = link.getAttribute('href').split('/').pop().split('#')[0];
        if (linkPage === currentPage && !link.getAttribute('href').startsWith('#')) {
            link.classList.add('active');
        }
    });

    // Bouton de notifications
    const notificationButton = document.createElement('button');
    notificationButton.type = 'button';
    notificationButton.className = 'notification-button';
    notificationButton.textContent = 'Notifications';
    notificationButton.addEventListener('click', function () {
        alert('Vous avez des notifications !');
    });
    document.body.appendChild(notificationButton);
});
